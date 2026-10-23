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
 * Backfill of balance_after on historical stock_movements rows. The snapshots
 * were historically taken from an in-memory stock that clamped at zero
 * (Math.max(0, current + delta)) while the MySQL path applies the raw delta
 * unclamped — so a deduction into negative stock recorded 0 while the item's
 * authoritative current_stock went to e.g. -15.
 *
 * Recompute every row per item as an ANCHORED running sum: walk the
 * chronological ledger BACKWARDS from the item's live current_stock (truth),
 * so the result is exact regardless of how much ledger coverage exists.
 * Convergent — only rows whose stored balance disagrees are rewritten — so
 * leaving it ungated on every boot is safe and self-healing.
 */
async function backfillStockMovementBalances(conn: any): Promise<void> {
  try {
    const [itemRows]: any = await conn.query('SELECT id, current_stock FROM items');
    const stockById = new Map<string, number>(
      (itemRows || []).map((r: any) => [r.id, Number(r.current_stock) || 0])
    );
    const [movRows]: any = await conn.query(
      'SELECT id, item_id, quantity, balance_after FROM stock_movements ORDER BY item_id ASC, movement_date ASC, created_at ASC'
    );
    if (!movRows || movRows.length === 0) return;

    const byItem = new Map<string, { id: string; qty: number; stored: any }[]>();
    for (const m of movRows || []) {
      if (!stockById.has(m.item_id)) continue; // no authoritative anchor (item deleted) — leave as-is
      if (!byItem.has(m.item_id)) byItem.set(m.item_id, []);
      byItem.get(m.item_id)!.push({ id: m.id, qty: Number(m.quantity) || 0, stored: m.balance_after });
    }

    let updated = 0;
    for (const [itemId, movs] of byItem) {
      let acc = stockById.get(itemId)!;
      for (let i = movs.length - 1; i >= 0; i--) {
        const m = movs[i];
        // DECIMAL columns roundtrip as strings; compare numerically
        const storedNum = m.stored === null || m.stored === undefined ? null : Number(m.stored);
        if (storedNum === null || isNaN(storedNum) || Math.abs(storedNum - acc) > 1e-9) {
          try {
            await conn.query('UPDATE stock_movements SET balance_after = ? WHERE id = ?', [acc, m.id]);
            updated++;
          } catch (e: any) {
            console.warn('[MySQL Migration] movement balance backfill notice:', e.message);
          }
        }
        acc -= m.qty;
      }
    }
    if (updated > 0) {
      console.log(`[MySQL Migration] balance_after backfill corrected ${updated} stock_movements rows.`);
    }
  } catch (e: any) {
    console.warn('[MySQL Migration] stock movement balance backfill skipped:', e.message);
  }
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
          cin VARCHAR(32),
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

      // Backward-compat: the CIN field was added to the company profile after
      // the table's first deployment — add the column if it is missing.
      try {
        const [csCols]: any = await conn.query('SHOW COLUMNS FROM company_settings');
        const csNames = (csCols || []).map((c: any) => c.Field);
        if (!csNames.includes('cin')) {
          await conn.query('ALTER TABLE company_settings ADD COLUMN cin VARCHAR(32) NULL AFTER pan');
          console.log('[MySQL Migration] Added cin column to company_settings.');
        }
      } catch (csAlterErr: any) {
        console.warn('[MySQL Migration] company_settings cin notice:', csAlterErr.message);
      }

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
          ownership VARCHAR(32) DEFAULT 'owned',
          status VARCHAR(32) DEFAULT 'available',
          assigned_driver_id VARCHAR(64),
          current_odometer DECIMAL(12,2) DEFAULT 0.00,
          fuel_capacity_litres DECIMAL(8,2),
          fitness_expiry_date VARCHAR(32),
          insurance_expiry_date VARCHAR(32),
          insurance_monthly_amount DECIMAL(12,2),
          puc_expiry_date VARCHAR(32),
          notes TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at VARCHAR(64),
          updated_at VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 9a. Vehicle EMI financing columns (backward-compatible ALTERs — the
      // emiDetails config persists on the vehicles row so the daily auto-debit
      // cron reads it from the saved table).
      try {
        const [vehCols]: any = await conn.query('SHOW COLUMNS FROM vehicles');
        const vehColNames = (vehCols || []).map((c: any) => c.Field);
        await conn.query(`
          CREATE TABLE IF NOT EXISTS vehicle_emi_entries (
            id VARCHAR(64) PRIMARY KEY,
            vehicle_id VARCHAR(64) NOT NULL,
            account_id VARCHAR(64) NOT NULL,
            date VARCHAR(32) NOT NULL,
            amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            source VARCHAR(16) DEFAULT 'auto',
            notes TEXT,
            created_at VARCHAR(64),
            INDEX idx_vem_vehicle (vehicle_id),
            INDEX idx_vem_account (account_id),
            INDEX idx_vem_date (date)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        const vehEmiCols: Array<[string, string, string | null]> = [
          ['ownership', "VARCHAR(32) DEFAULT 'owned'", null],
          ['insurance_monthly_amount', 'DECIMAL(12,2) NULL', null],
          ['emi_has_emi', 'BOOLEAN DEFAULT FALSE', null],
          ['emi_financier_name', 'VARCHAR(128) NULL', null],
          ['emi_loan_account_number', 'VARCHAR(64) NULL', null],
          ['emi_amount', 'DECIMAL(14,2) NULL', null],
          ['emi_due_day', 'INT NULL', null],
          ['emi_loan_start_date', 'VARCHAR(32) NULL', null],
          ['emi_loan_end_date', 'VARCHAR(32) NULL', null],
          ['emi_total_loan_amount', 'DECIMAL(14,2) NULL', null],
          ['emi_interest_rate', 'DECIMAL(6,2) NULL', null],
          ['emi_tenure_months', 'INT NULL', null],
          ['emi_paid_count', 'INT NULL', null],
          ['emi_account_id', 'VARCHAR(64) NULL', null],
          ['emi_auto_debit_account', 'VARCHAR(255) NULL', null],
          ['emi_status', "VARCHAR(24) NULL", null],
          ['emi_last_payment_date', 'VARCHAR(32) NULL', null],
          ['emi_notes', 'TEXT NULL', null],
        ];
        for (const [col, ddl] of vehEmiCols) {
          if (!vehColNames.includes(col)) {
            await conn.query(`ALTER TABLE vehicles ADD COLUMN ${col} ${ddl}`);
          }
        }
        // De-normalized driver name is GONE (client directive 2026-10-22):
        // only the assigned_driver_id FK is stored; display names resolve by
        // JOIN against the employees master at read time.
        if (vehColNames.includes('assigned_driver_name')) {
          await conn.query('ALTER TABLE vehicles DROP COLUMN assigned_driver_name');
          console.log('[MySQL Migration] Dropped vehicles.assigned_driver_name (driver names now JOIN from employees).');
        }
        // cost_per_km moved OFF the vehicle (client directive 2026-10-23):
        // freight is priced per SALE (weight × distance × rate), not per truck
        if (vehColNames.includes('cost_per_km')) {
          await conn.query('ALTER TABLE vehicles DROP COLUMN cost_per_km');
          console.log('[MySQL Migration] Dropped vehicles.cost_per_km (freight rate moved to sales_orders).');
        }
        if (!vehColNames.includes('emi_has_emi')) {
          console.log('[MySQL Migration] Added EMI financing columns to vehicles table.');
        }
      } catch (vehEmiErr: any) {
        console.warn('[MySQL Migration] vehicles EMI column alter check notice:', vehEmiErr.message);
      }

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
          time VARCHAR(8),
          vehicle_id VARCHAR(64) NULL COMMENT 'FK vehicles — NULL for outsourced (typed-plate) slips',
          vehicle_number VARCHAR(64) NOT NULL,
          sale_id VARCHAR(64) COMMENT 'FK sales_orders — set when the slip is auto-derived from a sales order (upsert key)',
          order_id VARCHAR(64) COMMENT 'legacy orders link',
          order_number VARCHAR(64) COMMENT 'linked document number snapshot',
          driver_id VARCHAR(64) NOT NULL COMMENT 'FK employees — driver display name JOINs from the employees master (never persisted)',
          trip_type VARCHAR(16) COMMENT 'outward | inward | internal',
          party_id VARCHAR(64) NULL COMMENT 'FK parties — party display name JOINs from the parties master (never persisted)',
          material_item_id VARCHAR(64) NULL COMMENT 'FK items — resolved when the slip comes from an order',
          destination VARCHAR(255) NOT NULL,
          material_name VARCHAR(128) NULL COMMENT 'manual (non-order) slips only — sale-derived slips resolve their material from the sale items',
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
          INDEX idx_trip_sale (sale_id),
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

      // 10a. Documents: S3-uploaded files (any feature) + order mapping tables.
      // documents = one row per uploaded file with its permanent S3 URL and a
      // soft status flag; sale_order_documents / purchase_order_documents are
      // pure FK join tables (order id ↔ document id). S3 objects are never
      // deleted by the app; 'deleted' documents keep their rows (audit).
      await conn.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id VARCHAR(64) PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL,
          document_name VARCHAR(255) NULL,
          s3_key VARCHAR(512) NOT NULL,
          url VARCHAR(1024) NOT NULL,
          content_type VARCHAR(128),
          size_bytes BIGINT DEFAULT 0.00,
          uploaded_by_id VARCHAR(64),
          status VARCHAR(32) DEFAULT 'active',
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_doc_status (status),
          INDEX idx_doc_uploaded_by (uploaded_by_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Backward-compat for deployments created before the naming split:
      // `name` renamed to `file_name`; user-entered `document_name` added.
      try {
        const [docCols]: any = await conn.query('SHOW COLUMNS FROM documents');
        const docNames = (docCols || []).map((c: any) => c.Field);
        if (docNames.includes('name') && !docNames.includes('file_name')) {
          await conn.query('ALTER TABLE documents CHANGE name file_name VARCHAR(255) NOT NULL');
          console.log('[MySQL Migration] Renamed documents.name to documents.file_name.');
        }
        if (!docNames.includes('document_name')) {
          await conn.query('ALTER TABLE documents ADD COLUMN document_name VARCHAR(255) NULL AFTER file_name');
          console.log('[MySQL Migration] Added document_name column to documents table.');
        }
        if (!docNames.includes('status') && !docNames.includes('name')) {
          await conn.query("ALTER TABLE documents ADD COLUMN status VARCHAR(32) DEFAULT 'active' AFTER uploaded_by_id");
          await conn.query("UPDATE documents SET status = 'active' WHERE status IS NULL");
          console.log('[MySQL Migration] Added status column to documents table.');
        }
      } catch (docStatusErr: any) {
        console.warn('[MySQL Migration] documents columns notice:', docStatusErr.message);
      }

      await conn.query(`
        CREATE TABLE IF NOT EXISTS sale_order_documents (
          id VARCHAR(64) PRIMARY KEY,
          sale_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_sale_doc (sale_id, document_id),
          INDEX idx_sod_sale (sale_id),
          INDEX idx_sod_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS purchase_order_documents (
          id VARCHAR(64) PRIMARY KEY,
          purchase_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_purchase_doc (purchase_id, document_id),
          INDEX idx_pod_purchase (purchase_id),
          INDEX idx_pod_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 10a-i. Party/item document mappings — same FK join shape as the
      // order document tables: a document may be mapped to a party and/or an
      // item; S3 objects are never deleted (audit), rows drop on owner delete.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS parties_documents (
          id VARCHAR(64) PRIMARY KEY,
          party_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_party_doc (party_id, document_id),
          INDEX idx_pd_party (party_id),
          INDEX idx_pd_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS inventory_documents (
          id VARCHAR(64) PRIMARY KEY,
          item_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_item_doc (item_id, document_id),
          INDEX idx_id_item (item_id),
          INDEX idx_id_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS employee_documents (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_employee_doc (employee_id, document_id),
          INDEX idx_ed_employee (employee_id),
          INDEX idx_ed_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS vehicle_documents (
          id VARCHAR(64) PRIMARY KEY,
          vehicle_id VARCHAR(64) NOT NULL,
          document_id VARCHAR(64) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          UNIQUE KEY uq_vehicle_doc (vehicle_id, document_id),
          INDEX idx_vd_vehicle (vehicle_id),
          INDEX idx_vd_document (document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 10b. Employees, Attendance, Leaves, Payments
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

      // Backward-compat: employees gained UPI payout + account-holder-name
      // columns with the employee-verification-documents feature; older
      // deployments predate them (SHOW COLUMNS guard = idempotent).
      try {
        const [empCols]: any = await conn.query('SHOW COLUMNS FROM employees');
        const empNames = (empCols || []).map((c: any) => c.Field);
        if (!empNames.includes('upi_address')) {
          await conn.query('ALTER TABLE employees ADD COLUMN upi_address VARCHAR(64) NULL AFTER bank_details');
          console.log('[MySQL Migration] Added upi_address column to employees table.');
        }
        if (!empNames.includes('name_on_account')) {
          await conn.query('ALTER TABLE employees ADD COLUMN name_on_account VARCHAR(128) NULL AFTER upi_address');
          console.log('[MySQL Migration] Added name_on_account column to employees table.');
        }
        if (!empNames.includes('default_in_time')) {
          await conn.query('ALTER TABLE employees ADD COLUMN default_in_time VARCHAR(8) NULL AFTER name_on_account');
          console.log('[MySQL Migration] Added default_in_time column to employees table.');
        }
        if (!empNames.includes('default_out_time')) {
          await conn.query('ALTER TABLE employees ADD COLUMN default_out_time VARCHAR(8) NULL AFTER default_in_time');
          console.log('[MySQL Migration] Added default_out_time column to employees table.');
        }
        // The driver's DL. The ORIGINAL live table (created by the first
        // migration) NEVER had license_number — no CREATE ever defined it and
        // no guard added it, so every write sending license_number (the
        // create REPLACE and liveSyncEmployee's REPLACE) FAILED on the live
        // table and the DL never persisted. NULL-able: old rows predate DLs.
        if (!empNames.includes('license_number')) {
          await conn.query('ALTER TABLE employees ADD COLUMN license_number VARCHAR(64) NULL AFTER pan_number');
          console.log('[MySQL Migration] Added license_number column to employees table.');
        }
      } catch (empColErr: any) {
        console.warn('[MySQL Migration] employees columns notice:', empColErr.message);
      }

      await conn.query(`
        CREATE TABLE IF NOT EXISTS attendance (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          in_time VARCHAR(32),
          out_time VARCHAR(32),
          work_hours DECIMAL(5,2) DEFAULT 0.00,
          overtime_hours DECIMAL(5,2) DEFAULT 0.00,
          notes TEXT,
          created_at VARCHAR(64),
          updated_at VARCHAR(64),
          INDEX idx_att_date (date),
          INDEX idx_att_emp (employee_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Older deployments' attendance table still carries employee_name
      // (NOT NULL, no default) from before the JOIN-based display switch —
      // it has NO default value and the write paths no longer send it, so
      // EVERY attendance insert fails with "Field 'employee_name' doesn't
      // have a default value" and attendance never persists. Drop it:
      // the name is a live view JOINed from the employees master
      // (same FK-purity cleanup already applied to employee_payments).
      try {
        const [attCols]: any = await conn.query('SHOW COLUMNS FROM attendance');
        const attNames = (attCols || []).map((c: any) => c.Field);
        if (attNames.length > 0 && attNames.includes('employee_name')) {
          try {
            await conn.query('ALTER TABLE attendance DROP COLUMN employee_name');
            console.log('[MySQL Migration] Dropped employee_name column from attendance (JOIN-based display).');
          } catch (attDropErr: any) {
            console.warn('[MySQL Migration] DROP failed, making employee_name nullable instead:', attDropErr.message);
            await conn.query("ALTER TABLE attendance MODIFY COLUMN employee_name VARCHAR(255) NULL DEFAULT NULL");
            console.log('[MySQL Migration] attendance.employee_name is now nullable — writes succeed.');
          }
        }
      } catch (attNameErr: any) {
        console.warn('[MySQL Migration] attendance employee_name notice:', attNameErr.message);
      }

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

      // Payroll payouts now leave a Cash/Bank account (payroll ⇄ cash-bank
      // ledger linkage) — account_id added with the payroll-payments feature
      try {
        const [payCols]: any = await conn.query('SHOW COLUMNS FROM employee_payments');
        const payNames = (payCols || []).map((c: any) => c.Field);
        if (!payNames.includes('account_id')) {
          await conn.query("ALTER TABLE employee_payments ADD COLUMN account_id VARCHAR(64) NULL AFTER payment_mode, ADD INDEX idx_ep_account (account_id)");
          console.log('[MySQL Migration] Added account_id column to employee_payments table.');
        }
        // FK purity: employee_name now resolves from the employees master via
        // JOIN — the stored copy column goes away (safe: display-only)
        if (payNames.includes('employee_name')) {
          await conn.query('ALTER TABLE employee_payments DROP COLUMN employee_name');
          console.log('[MySQL Migration] Dropped employee_name column from employee_payments (JOIN-based display).');
        }
      } catch (payColErr: any) {
        console.warn('[MySQL Migration] employee_payments columns notice:', payColErr.message);
      }

      // Employee Ledger — one virtual account per employee (running balance
      // derived as opening + chronological fold; FK-only employee_id, the
      // name JOINs from the employees master at read time).
      await conn.query(`
        CREATE TABLE IF NOT EXISTS employee_ledger_transactions (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          type VARCHAR(32) NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          reason TEXT NOT NULL,
          account_id VARCHAR(64),
          direction VARCHAR(16),
          intent VARCHAR(16),
          source VARCHAR(32) DEFAULT 'manual',
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_elt_emp (employee_id, date),
          INDEX idx_elt_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Ledger rows gained the record-surface marker (adjust/paid/received)
      // for the Particulars tag; older deployments predate it.
      try {
        const [eltCols]: any = await conn.query('SHOW COLUMNS FROM employee_ledger_transactions');
        const eltNames = (eltCols || []).map((c: any) => c.Field);
        if (eltNames.length > 0 && !eltNames.includes('intent')) {
          await conn.query('ALTER TABLE employee_ledger_transactions ADD COLUMN intent VARCHAR(16) NULL AFTER direction');
          console.log('[MySQL Migration] Added intent column to employee_ledger_transactions table.');
        }
      } catch (eltIntentErr: any) {
        console.warn('[MySQL Migration] employee_ledger_transactions intent notice:', eltIntentErr.message);
      }

      // Employees gained the ledger opening balance (signed: +ve = company
      // owes the employee). Older deployments predate it (guard = idempotent).
      try {
        const [empCols]: any = await conn.query('SHOW COLUMNS FROM employees');
        const empNames = (empCols || []).map((c: any) => c.Field);
        if (!empNames.includes('opening_balance')) {
          await conn.query('ALTER TABLE employees ADD COLUMN opening_balance DECIMAL(15,2) DEFAULT 0.00 AFTER daily_wage_rate');
          console.log('[MySQL Migration] Added opening_balance column to employees table.');
        }
      } catch (empOpenBalErr: any) {
        console.warn('[MySQL Migration] employees opening_balance notice:', empOpenBalErr.message);
      }

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

      // Recompute balance_after on ledger rows whose stored snapshot disagrees
      // with the anchored running sum (legacy clamped-snapshot rows).
      await backfillStockMovementBalances(conn);

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

      // 16. SALES & PURCHASE — RELATIONAL ORDER MODEL (Phase 1 redesign)
      // The legacy `orders` JSON-blob table is retired (kept, never written):
      // split into sale/purchase masters + items child tables + stage-history
      // child tables. Child tables are FK-only (Golden Rule §2); document
      // numbers + stage totals are the §2 exception-1 statutory snapshots.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS sales_orders (
          id VARCHAR(64) PRIMARY KEY,
          sale_number VARCHAR(64) NOT NULL,
          party_id VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          status VARCHAR(32) DEFAULT 'pending',
          notes TEXT,
          vehicle_id VARCHAR(64) COMMENT 'FK vehicles — dispatch trip is auto-derived from the attachment',
          site_address VARCHAR(255) COMMENT 'drop / unloading site address of the trip',
          distance_km DECIMAL(10,2) COMMENT 'planned travel distance (km)',
          weight_tonnes DECIMAL(12,3) COMMENT 'load weight of the whole order (MT) — ONE value for all items; feeds the trip slip',
          vehicle_no VARCHAR(64),
          driver_name VARCHAR(128),
          transport_charges DECIMAL(12,2) DEFAULT 0.00,
          freight_rate_per_tonne DECIMAL(10,2) COMMENT 'fleet-cost rate ₹/tonne-km — priced PER SALE',
          freight_gst_rate DECIMAL(5,2) COMMENT 'GST slab on the fleet-cost row',
          inventory_applied BOOLEAN DEFAULT FALSE,
          cash_applied BOOLEAN DEFAULT FALSE,
          settlement_type VARCHAR(16) COMMENT 'credit | account | NULL = payment flow not applied',
          settlement_account_id VARCHAR(64) COMMENT 'FK cash_bank_accounts — where the invoice payment was deposited',
          payment_mode VARCHAR(64) COMMENT 'bank_transfer | neft_rtgs | upi | cheque | cash',
          invoice_voucher_id VARCHAR(64) COMMENT 'FK transactions — the sale_invoice journal voucher',
          settlement_voucher_id VARCHAR(64) COMMENT 'FK transactions — the payment_in receipt voucher',
          settled_amount DECIMAL(15,2) COMMENT 'statutory snapshot of the settled total',
          settled_date VARCHAR(32) COMMENT 'date of the settlement stage',
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_sales_number (sale_number),
          INDEX idx_sales_party (party_id),
          INDEX idx_sales_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS sales_order_items (
          id VARCHAR(64) PRIMARY KEY,
          sale_id VARCHAR(64) NOT NULL,
          item_id VARCHAR(64) NOT NULL,
          unit_id VARCHAR(64) COMMENT 'FK item_units — display JOINed at read',
          quantity DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          rate DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
          gst_rate DECIMAL(5,2) DEFAULT NULL,
          location_id VARCHAR(64) COMMENT 'FK item_locations — dispatched from',
          item_notes TEXT,
          weight_tonnes DECIMAL(12,3) COMMENT 'line load weight (MT) — sums into the trip slip load',
          INDEX idx_soi_sale (sale_id),
          INDEX idx_soi_item (item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS sales_order_stages (
          id VARCHAR(64) PRIMARY KEY,
          sale_id VARCHAR(64) NOT NULL,
          stage_type VARCHAR(32) NOT NULL,
          stage_number VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          subtotal DECIMAL(15,2) DEFAULT 0.00,
          tax_amount DECIMAL(15,2) DEFAULT 0.00,
          total_amount DECIMAL(15,2) DEFAULT 0.00,
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_sost_sale (sale_id),
          INDEX idx_sost_type (stage_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id VARCHAR(64) PRIMARY KEY,
          purchase_number VARCHAR(64) NOT NULL,
          party_id VARCHAR(64) NULL COMMENT 'nullable: RFQ ingestion may have no vendor yet',
          date VARCHAR(32) NOT NULL,
          status VARCHAR(32) DEFAULT 'pending',
          notes TEXT,
          inventory_applied BOOLEAN DEFAULT FALSE,
          cash_applied BOOLEAN DEFAULT FALSE,
          settlement_type VARCHAR(16) COMMENT 'credit | account | NULL = payment flow not applied',
          settlement_account_id VARCHAR(64) COMMENT 'FK cash_bank_accounts — account the vendor was paid from',
          payment_mode VARCHAR(64) COMMENT 'bank_transfer | neft_rtgs | upi | cheque | cash',
          invoice_voucher_id VARCHAR(64) COMMENT 'FK transactions — the purchase_bill journal voucher',
          settlement_voucher_id VARCHAR(64) COMMENT 'FK transactions — the payment_out payout voucher',
          settled_amount DECIMAL(15,2) COMMENT 'statutory snapshot of the settled total',
          settled_date VARCHAR(32) COMMENT 'date of the settlement stage',
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64),
          INDEX idx_purch_number (purchase_number),
          INDEX idx_purch_party (party_id),
          INDEX idx_purch_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id VARCHAR(64) PRIMARY KEY,
          purchase_id VARCHAR(64) NOT NULL,
          item_id VARCHAR(64) NOT NULL,
          unit_id VARCHAR(64) COMMENT 'FK item_units — display JOINed at read',
          quantity DECIMAL(15,3) NOT NULL DEFAULT 0.000,
          rate DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
          gst_rate DECIMAL(5,2) DEFAULT NULL,
          location_id VARCHAR(64) COMMENT 'FK item_locations — received into',
          received_quantity DECIMAL(15,3) DEFAULT NULL,
          shortage_quantity DECIMAL(15,3) DEFAULT NULL,
          overage_quantity DECIMAL(15,3) DEFAULT NULL,
          item_notes TEXT,
          INDEX idx_poi_purchase (purchase_id),
          INDEX idx_poi_item (item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS purchase_order_stages (
          id VARCHAR(64) PRIMARY KEY,
          purchase_id VARCHAR(64) NOT NULL,
          stage_type VARCHAR(32) NOT NULL,
          stage_number VARCHAR(64) NOT NULL,
          date VARCHAR(32) NOT NULL,
          subtotal DECIMAL(15,2) DEFAULT 0.00,
          tax_amount DECIMAL(15,2) DEFAULT 0.00,
          total_amount DECIMAL(15,2) DEFAULT 0.00,
          stage_details JSON COMMENT 'rfqDetails / poDetails / receiptDetails snapshot',
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_post_purchase (purchase_id),
          INDEX idx_post_type (stage_type),
          UNIQUE KEY uk_post_stage (purchase_id, stage_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // stock_movements.reference_id: FK to the source sale/purchase master —
      // reversal lookups key on the id, not the reference-number string.
      try {
        const [smrCols]: any = await conn.query('SHOW COLUMNS FROM stock_movements');
        const smrColNames = (smrCols || []).map((c: any) => c.Field);
        if (smrColNames.length > 0 && !smrColNames.includes('reference_id')) {
          await conn.query('ALTER TABLE stock_movements ADD COLUMN reference_id VARCHAR(64) NULL AFTER reference_number');
          console.log('[MySQL Migration] Added stock_movements.reference_id column.');
        }
      } catch (smRefErr: any) {
        console.warn('[MySQL Migration] stock_movements reference_id notice:', smRefErr.message);
      }

      // SALE/PURCHASE MASTER settlement FKs (cash posting to Cash & Bank):
      // settlement_account_id → cash_bank_accounts; *_voucher_id →
      // transactions (Golden Rule §2 — FK only, names JOINed at read time).
      const settlementCols: Array<[string, string]> = [
        ['settlement_account_id', "VARCHAR(64) NULL COMMENT 'FK cash_bank_accounts'"],
        ['payment_mode', "VARCHAR(64) NULL COMMENT 'bank_transfer | neft_rtgs | upi | cheque | cash'"],
        ['invoice_voucher_id', "VARCHAR(64) NULL COMMENT 'FK transactions — invoice/bill journal voucher'"],
        ['settlement_voucher_id', "VARCHAR(64) NULL COMMENT 'FK transactions — payment receipt/payout voucher'"],
        ['settled_amount', "DECIMAL(15,2) NULL COMMENT 'statutory snapshot of the settled total'"],
        ['settled_date', "VARCHAR(32) NULL COMMENT 'date of the settlement stage'"],
      ];
      for (const masterTable of ['sales_orders', 'purchase_orders'] as const) {
        try {
          const [msCols]: any = await conn.query(`SHOW COLUMNS FROM ${masterTable}`);
          const msColNames = (msCols || []).map((c: any) => c.Field);
          if (msColNames.length === 0) continue;
          for (const [col, def] of settlementCols) {
            if (!msColNames.includes(col)) {
              const lastCol = msColNames[msColNames.length - 1];
              await conn.query(`ALTER TABLE ${masterTable} ADD COLUMN ${col} ${def} AFTER ${lastCol}`);
            }
          }
        } catch (mSettleErr: any) {
          console.warn(`[MySQL Migration] ${masterTable} settlement columns notice:`, mSettleErr.message);
        }
      }

      // One-time legacy backfill: split `orders` rows into the new tables.
      // Runs ONLY while both sales_orders and purchase_orders are completely
      // empty. Masters keep the legacy order ids; stages are synthesized from
      // the columns that WERE persisted (stage for sales; purchases derive GRN
      // only when the items JSON carries receivedQuantity — purchaseStage was
      // never persisted on the legacy table).
      try {
        const [soCnt]: any = await conn.query('SELECT COUNT(*) as cnt FROM sales_orders');
        const [poCnt]: any = await conn.query('SELECT COUNT(*) as cnt FROM purchase_orders');
        const [ordCnt]: any = await conn.query('SELECT COUNT(*) as cnt FROM orders');
        if ((soCnt[0]?.cnt || 0) === 0 && (poCnt[0]?.cnt || 0) === 0 && (ordCnt[0]?.cnt || 0) > 0) {
          const [legacyOrders]: any = await conn.query('SELECT * FROM orders');
          let splitCount = 0;
          for (const o of legacyOrders || []) {
            let lineItems: any[] = [];
            try {
              lineItems = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            } catch {
              lineItems = [];
            }
            const type = o.type === 'purchase' ? 'purchase' : 'sales';
            const hasReceived = Array.isArray(lineItems) && lineItems.some((li) => li && li.receivedQuantity !== undefined && li.receivedQuantity !== null);
            const legacyStage =
              type === 'purchase'
                ? hasReceived ? 'goods_receipt' : 'purchase_order'
                : o.stage || 'sales_order';
            // Legacy stock application: automatic for everything except sales
            // quotations / purchase RFQs (the legacy applyOrderStock gating).
            const legacyInventoryApplied =
              (Array.isArray(lineItems) && lineItems.length > 0 && !['quotation', 'rfq'].includes(legacyStage) && o.status !== 'cancelled') ? 1 : 0;
            const subtotal = Math.max(0, Number(o.total_amount) - Number(o.tax_amount));
            const createdAt = o.created_at || new Date().toISOString();

            if (type === 'sales') {
              await conn.query(
                `INSERT IGNORE INTO sales_orders (id, sale_number, party_id, date, status, notes, vehicle_no, driver_name, transport_charges, inventory_applied, cash_applied, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
                [o.id, o.order_number, o.party_id, o.date, o.status || 'pending', o.notes || null, o.vehicle_no || null, o.driver_name || null, o.transport_charges || 0, legacyInventoryApplied, createdAt, o.updated_at || createdAt]
              );
              for (const li of lineItems || []) {
                if (!li?.itemId) continue;
                await conn.query(
                  `INSERT IGNORE INTO sales_order_items (id, sale_id, item_id, unit_id, quantity, rate, gst_rate, location_id, item_notes)
                   VALUES (?, ?, ?, (SELECT id FROM item_units WHERE LOWER(TRIM(code)) = LOWER(TRIM(?)) LIMIT 1), ?, ?, ?, (SELECT id FROM item_locations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1), ?)`,
                  [`soi-${o.id}-${(li.itemId || '').slice(-12)}`, o.id, li.itemId, li.unit || null, Number(li.quantity) || 0, Number(li.rate) || 0, li.gstRate ?? null, li.location || null, li.itemNotes || null]
                );
              }
              await conn.query(
                `INSERT IGNORE INTO sales_order_stages (id, sale_id, stage_type, stage_number, date, subtotal, tax_amount, total_amount, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [`sos-${o.id}`, o.id, legacyStage, o.order_number, o.date, subtotal, Number(o.tax_amount) || 0, Number(o.total_amount) || 0, o.notes || null, createdAt]
              );
            } else {
              await conn.query(
                `INSERT IGNORE INTO purchase_orders (id, purchase_number, party_id, date, status, notes, inventory_applied, cash_applied, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
                [o.id, o.order_number, o.party_id, o.date, o.status || 'pending', o.notes || null, legacyInventoryApplied, createdAt, o.updated_at || createdAt]
              );
              for (const li of lineItems || []) {
                if (!li?.itemId) continue;
                const ordered = Number(li.quantity) || 0;
                const recv = li.receivedQuantity !== undefined && li.receivedQuantity !== null ? Number(li.receivedQuantity) : null;
                await conn.query(
                  `INSERT IGNORE INTO purchase_order_items (id, purchase_id, item_id, unit_id, quantity, rate, gst_rate, location_id, received_quantity, shortage_quantity, overage_quantity, item_notes)
                   VALUES (?, ?, ?, (SELECT id FROM item_units WHERE LOWER(TRIM(code)) = LOWER(TRIM(?)) LIMIT 1), ?, ?, ?, (SELECT id FROM item_locations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1), ?, ?, ?, ?)`,
                  [`poi-${o.id}-${(li.itemId || '').slice(-12)}`, o.id, li.itemId, li.unit || null, ordered, Number(li.rate) || 0, li.gstRate ?? null, li.location || null, recv, recv !== null && recv < ordered ? ordered - recv : null, recv !== null && recv > ordered ? recv - ordered : null, li.itemNotes || null]
                );
              }
              await conn.query(
                `INSERT IGNORE INTO purchase_order_stages (id, purchase_id, stage_type, stage_number, date, subtotal, tax_amount, total_amount, stage_details, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
                [`pos-${o.id}`, o.id, legacyStage, o.order_number, o.date, subtotal, Number(o.tax_amount) || 0, Number(o.total_amount) || 0, o.notes || null, createdAt]
              );
            }
            splitCount++;
          }
          // Link historical ledger rows to the new masters by reference number
          await conn.query(
            `UPDATE stock_movements sm LEFT JOIN sales_orders so ON so.sale_number = sm.reference_number
             SET sm.reference_id = so.id
             WHERE sm.reference_id IS NULL AND so.id IS NOT NULL`
          );
          await conn.query(
            `UPDATE stock_movements sm LEFT JOIN purchase_orders po ON po.purchase_number = sm.reference_number
             SET sm.reference_id = po.id
             WHERE sm.reference_id IS NULL AND po.id IS NOT NULL`
          );
          console.log(`[MySQL Migration] Split ${splitCount} legacy orders into sales_orders/purchase_orders (+items, +stages).`);
        }
      } catch (splitErr: any) {
        console.warn('[MySQL Migration] orders split backfill notice:', splitErr.message);
      }

      // 16b. STAGE-SCOPED SALE ITEMS: sales_order_items.sales_order_stage_id
      // (per-stage item sets — quotation lines freeze when the sale advances;
      // a sales order edit touches only its own stage rows)
      try {
        const [soiCols]: any = await conn.query('SHOW COLUMNS FROM sales_order_items');
        const soiColNames = (soiCols || []).map((c: any) => c.Field);
        if (soiColNames.length > 0) {
          if (!soiColNames.includes('sales_order_stage_id')) {
            await conn.query('ALTER TABLE sales_order_items ADD COLUMN sales_order_stage_id VARCHAR(64) NULL AFTER sale_id');
            console.log('[MySQL Migration] Added sales_order_items.sales_order_stage_id column.');
          }
          // Backfill: attach stage-less item rows to their sale's EFFECTIVE
          // (latest issued) stage so legacy masters map onto the new model.
          const [orphanItems]: any = await conn.query(
            'SELECT id, sale_id FROM sales_order_items WHERE sales_order_stage_id IS NULL'
          );
          let linked = 0;
          const bySale = new Map<string, string[]>();
          for (const it of orphanItems || []) {
            const key = it.sale_id;
            if (!bySale.has(key)) bySale.set(key, []);
            bySale.get(key)!.push(it.id);
          }
          for (const [saleId, itemIds] of bySale) {
            const [stRows]: any = await conn.query(
              'SELECT id, stage_type FROM sales_order_stages WHERE sale_id = ? ORDER BY created_at ASC',
              [saleId]
            );
            if (!stRows || stRows.length === 0) continue;
            // Effective stage = first quotation if it's the ONLY stage; else the
            // highest one present (sales_order, then sales_invoice)
            const types = stRows.map((st: any) => st.stage_type);
            const eff = types.length === 1 ? stRows[0] : (stRows.find((s: any) => s.stage_type === 'sales_invoice') || stRows.find((s: any) => s.stage_type === 'sales_order') || stRows[0]);
            await conn.query('UPDATE sales_order_items SET sales_order_stage_id = ? WHERE id IN (?)', [eff.id, itemIds]);
            linked += itemIds.length;
          }
          if (linked > 0) console.log(`[MySQL Migration] Linked ${linked} sales_order_items rows to their stage documents.`);
        }
      } catch (soiErr: any) {
        console.warn('[MySQL Migration] stage-scoped sale items notice:', soiErr.message);
      }

      // 16c. PAYMENT-FLOW TYPE on sale/purchase masters: settlement_type
      // ('credit' | 'account' | NULL = flow untouched). cash_applied is
      // re-purposed as "payment flow applied (locked)" — credit bookings set
      // it too — so the type tells the two flows apart.
      const settleTypeTables = ['sales_orders', 'purchase_orders'] as const;
      for (const masterTable of settleTypeTables) {
        try {
          const [stCols]: any = await conn.query(`SHOW COLUMNS FROM ${masterTable}`);
          const stColNames = (stCols || []).map((c: any) => c.Field);
          if (stColNames.length > 0 && !stColNames.includes('settlement_type')) {
            await conn.query(`ALTER TABLE ${masterTable} ADD COLUMN settlement_type VARCHAR(16) NULL AFTER cash_applied`);
            console.log(`[MySQL Migration] Added ${masterTable}.settlement_type column.`);
          }
        } catch (stTypeErr: any) {
          console.warn(`[MySQL Migration] ${masterTable} settlement_type notice:`, stTypeErr.message);
        }
      }
      try {
        const [stBackfill]: any = await conn.query(
          `UPDATE sales_orders SET settlement_type = 'account' WHERE settlement_voucher_id IS NOT NULL AND settlement_type IS NULL`
        );
        const [ptBackfill]: any = await conn.query(
          `UPDATE purchase_orders SET settlement_type = 'account' WHERE settlement_voucher_id IS NOT NULL AND settlement_type IS NULL`
        );
        // Legacy credit bookings: the unpaid invoice/bill journal voucher was
        // posted but no money moved — those rows were "book on credit".
        const [scBackfill]: any = await conn.query(
          `UPDATE sales_orders so LEFT JOIN transactions t ON t.id = CONCAT('txn-', so.id, '-inv')
           SET so.settlement_type = 'credit'
           WHERE so.settlement_type IS NULL AND t.id IS NOT NULL`
        );
        const [pcBackfill]: any = await conn.query(
          `UPDATE purchase_orders po LEFT JOIN transactions t ON t.id = CONCAT('txn-', po.id, '-bill')
           SET po.settlement_type = 'credit'
           WHERE po.settlement_type IS NULL AND t.id IS NOT NULL`
        );
        // Safety net: locked rows must carry a type.
        await conn.query(`UPDATE sales_orders SET settlement_type = 'account' WHERE cash_applied = 1 AND settlement_type IS NULL`);
        await conn.query(`UPDATE purchase_orders SET settlement_type = 'account' WHERE cash_applied = 1 AND settlement_type IS NULL`);
        const backfilled = (stBackfill?.affectedRows || 0) + (ptBackfill?.affectedRows || 0) + (scBackfill?.affectedRows || 0) + (pcBackfill?.affectedRows || 0);
        if (backfilled > 0) console.log(`[MySQL Migration] Backfilled settlement_type on ${backfilled} sale/purchase master rows.`);
      } catch (stBackfillErr: any) {
        console.warn('[MySQL Migration] settlement_type backfill notice:', stBackfillErr.message);
      }

      // 16d. SALE → TRIP SLIP dispatch attachment: sales_orders.vehicle_id /
      // site_address / distance_km, sales_order_items.weight_tonnes and the
      // trip_slips.sale_id back-link (Slip ⇢ sale master — auto-derived slips
      // upsert against it on every sale edit).
      try {
        const [msoCols]: any = await conn.query('SHOW COLUMNS FROM sales_orders');
        const mso = (msoCols || []).map((c: any) => c.Field);
        if (mso.length > 0) {
          if (!mso.includes('vehicle_id')) {
            await conn.query("ALTER TABLE sales_orders ADD COLUMN vehicle_id VARCHAR(64) NULL COMMENT 'FK vehicles — dispatch trip is auto-derived from the attachment' AFTER notes");
            console.log('[MySQL Migration] Added sales_orders.vehicle_id column.');
          }
          if (!mso.includes('site_address')) {
            await conn.query("ALTER TABLE sales_orders ADD COLUMN site_address VARCHAR(255) NULL AFTER vehicle_id");
            console.log('[MySQL Migration] Added sales_orders.site_address column.');
          }
          if (!mso.includes('distance_km')) {
            await conn.query('ALTER TABLE sales_orders ADD COLUMN distance_km DECIMAL(10,2) NULL AFTER site_address');
            console.log('[MySQL Migration] Added sales_orders.distance_km column.');
          }
          if (!mso.includes('weight_tonnes')) {
            await conn.query('ALTER TABLE sales_orders ADD COLUMN weight_tonnes DECIMAL(12,3) NULL AFTER distance_km');
            console.log('[MySQL Migration] Added sales_orders.weight_tonnes column.');
          }
          if (!mso.includes('freight_rate_per_tonne')) {
            await conn.query("ALTER TABLE sales_orders ADD COLUMN freight_rate_per_tonne DECIMAL(10,2) NULL COMMENT 'fleet-cost rate ₹/tonne-km — priced PER SALE' AFTER transport_charges");
            console.log('[MySQL Migration] Added sales_orders.freight_rate_per_tonne column.');
          }
          if (!mso.includes('freight_gst_rate')) {
            await conn.query("ALTER TABLE sales_orders ADD COLUMN freight_gst_rate DECIMAL(5,2) NULL AFTER freight_rate_per_tonne");
            console.log('[MySQL Migration] Added sales_orders.freight_gst_rate column.');
          }
        }
        const [msiCols]: any = await conn.query('SHOW COLUMNS FROM sales_order_items');
        const msi = (msiCols || []).map((c: any) => c.Field);
        if (msi.length > 0 && !msi.includes('weight_tonnes')) {
          await conn.query('ALTER TABLE sales_order_items ADD COLUMN weight_tonnes DECIMAL(12,3) NULL AFTER item_notes');
          console.log('[MySQL Migration] Added sales_order_items.weight_tonnes column.');
        }
        const [mtsCols]: any = await conn.query('SHOW COLUMNS FROM trip_slips');
        const mts = (mtsCols || []).map((c: any) => c.Field);
        if (mts.length > 0) {
          if (!mts.includes('sale_id')) {
            await conn.query('ALTER TABLE trip_slips ADD COLUMN sale_id VARCHAR(64) NULL AFTER vehicle_number');
            console.log('[MySQL Migration] Added trip_slips.sale_id column.');
          }
          if (!mts.includes('time')) {
            // Schema drift: the TS TripSlip carries HH:mm but MySQL never
            // stored it — REPLACE wipes without the column, so slip times
            // came back as a fixed '10:00' fallback after every reload.
            await conn.query("ALTER TABLE trip_slips ADD COLUMN time VARCHAR(8) NULL AFTER date");
            console.log('[MySQL Migration] Added trip_slips.time column.');
          }
          if (!mts.includes('trip_type')) {
            await conn.query("ALTER TABLE trip_slips ADD COLUMN trip_type VARCHAR(16) NULL AFTER driver_name");
            console.log('[MySQL Migration] Added trip_slips.trip_type column.');
          }
          // order_id / order_number / material_item_id: written by BOTH the
          // liveSync and createTripSlipDirect but never created — every slip
          // INSERT/REPLACE failed wholesale (P0: slips persisted nowhere).
          // party_id (NOT NULL with no slip semantics) becomes nullable: the
          // order link used to be smuggled into it.
          if (!mts.includes('order_id')) {
            await conn.query('ALTER TABLE trip_slips ADD COLUMN order_id VARCHAR(64) NULL AFTER sale_id');
            console.log('[MySQL Migration] Added trip_slips.order_id column.');
          }
          if (!mts.includes('order_number')) {
            await conn.query('ALTER TABLE trip_slips ADD COLUMN order_number VARCHAR(64) NULL AFTER order_id');
            console.log('[MySQL Migration] Added trip_slips.order_number column.');
          }
          if (!mts.includes('material_item_id')) {
            await conn.query('ALTER TABLE trip_slips ADD COLUMN material_item_id VARCHAR(64) NULL AFTER party_name');
            console.log('[MySQL Migration] Added trip_slips.material_item_id column.');
          }
          if (mts.includes('party_id')) {
            await conn.query('ALTER TABLE trip_slips MODIFY party_id VARCHAR(64) NULL');
          }
          // Outsourced (typed-plate) slips carry no fleet vehicle FK
          if (mts.includes('vehicle_id')) {
            await conn.query('ALTER TABLE trip_slips MODIFY vehicle_id VARCHAR(64) NULL');
          }
          // Backfill: sale-derived slips created before the saleId key landed
          // carry only order_id — adopt it so sale edits update IN PLACE
          // instead of minting duplicate slips per save.
          const [bfRes]: any = await conn.query(
            'UPDATE trip_slips SET sale_id = order_id WHERE sale_id IS NULL AND order_id IS NOT NULL'
          );
          if (bfRes.affectedRows > 0) {
            console.log(`[MySQL Migration] Backfilled sale_id on ${bfRes.affectedRows} sale-derived trip slip(s).`);
          }
          // Distance backfill: liveSyncTripSlip used to persist a hardcoded 0
          // into distance_km — adopt the sale's planned distance (slips keep
          // only the sale FK; the sale master holds the trip plan).
          const [dbRes]: any = await conn.query(
            `UPDATE trip_slips ts
               JOIN sales_orders so ON so.id = COALESCE(ts.sale_id, ts.order_id)
               SET ts.distance_km = so.distance_km
             WHERE (ts.distance_km = 0 OR ts.distance_km IS NULL) AND so.distance_km > 0`
          );
          if (dbRes.affectedRows > 0) {
            console.log(`[MySQL Migration] Backfilled distance_km on ${dbRes.affectedRows} trip slip(s) from their sales orders.`);
          }
          // FK-only storage (Golden Rule §2): driver/party display names are
          // NOT persisted — they JOIN from the employees/parties masters at
          // read. Sale-derived slips resolve their material from the sale
          // items; only manual (non-order) slips keep a material text.
          if (mts.includes('driver_name')) {
            await conn.query('ALTER TABLE trip_slips DROP COLUMN driver_name');
            console.log('[MySQL Migration] Dropped trip_slips.driver_name (resolved by JOIN employees on driver_id).');
          }
          if (mts.includes('party_name')) {
            await conn.query('ALTER TABLE trip_slips DROP COLUMN party_name');
            console.log('[MySQL Migration] Dropped trip_slips.party_name (resolved by JOIN parties on party_id).');
          }
          if (mts.includes('material_name')) {
            await conn.query('ALTER TABLE trip_slips MODIFY material_name VARCHAR(128) NULL COMMENT \'manual (non-order) slips only — sale-derived slips resolve their material from the sale items\'');
          }
          const [idxRows]: any = await conn.query('SHOW INDEX FROM trip_slips WHERE Key_name = "idx_trip_sale"');
          if (!idxRows || idxRows.length === 0) {
            await conn.query('ALTER TABLE trip_slips ADD INDEX idx_trip_sale (sale_id)');
            console.log('[MySQL Migration] Added trip_slips idx_trip_sale index.');
          }
        }
      } catch (dispErr: any) {
        console.warn('[MySQL Migration] sale dispatch columns notice:', dispErr.message);
      }

      // 16e. TYRE FEATURE SPLIT: manage_tyres became its own feature-control
      // key (2026-10-23 — Tyre Management moved out of Fleet into a dedicated
      // sidebar feature). Grant it to every account whose manage_fleet flag is
      // on so nobody loses tyre access; admins revoke via User Management.
      try {
        const [tyreUsers]: any = await conn.query(
          `SELECT id FROM users
             WHERE JSON_EXTRACT(permissions, '$.manage_fleet') = TRUE
               AND JSON_EXTRACT(permissions, '$.manage_tyres') IS NULL`
        );
        for (const u of tyreUsers || []) {
          await conn.query(
            `UPDATE users SET permissions = JSON_SET(permissions, '$.manage_tyres', TRUE) WHERE id = ?`,
            [u.id]
          );
        }
        if ((tyreUsers || []).length > 0) {
          console.log(`[MySQL Migration] Granted manage_tyres to ${tyreUsers.length} fleet user(s) (feature split).`);
        }
      } catch (tyrePermErr: any) {
        console.warn('[MySQL Migration] tyre permission grant notice:', tyrePermErr.message);
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
            id, company_name, tagline, trade_name, gstin, pan, cin, email, phone, website,
            address_street, address_city, address_state, address_state_code, address_pincode,
            invoice_notes, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'default_settings',
            s.companyName,
            s.tagline || null,
            s.tradeName || null,
            s.gstin || null,
            s.pan || null,
            s.cin || null,
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
          `REPLACE INTO vehicles (id, registration_number, type, capacity_tonnes, tare_weight_kg, status, assigned_driver_id, current_odometer, fuel_capacity_litres, fitness_expiry_date, insurance_expiry_date, puc_expiry_date, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id,
            (v as any).registrationNumber || (v as any).vehicleNumber || (v as any).registrationNo || v.id,
            v.type || 'Tipper Truck (10 Wheeler)',
            v.capacityTonnes || 0,
            (v as any).tareWeightKg || 0,
            v.status || 'available',
            (v as any).assignedDriverId || (v as any).currentDriverId || null,
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

      // Seed trip slips (column set mirrors liveSyncTripSlip — FK-only: the
      // driver/party display names JOIN from the masters at read; sale-derived
      // slips resolve their material from the sale items)
      for (const ts of (snapshot.tripSlips || []) as any[]) {
        await conn.query(
          `REPLACE INTO trip_slips (id, slip_number, date, time, vehicle_id, vehicle_number, sale_id, order_id, order_number, driver_id, trip_type, party_id, destination, material_item_id, material_name, gross_weight_kg, tare_weight_kg, net_weight_kg, net_weight_tonnes, start_odometer, end_odometer, distance_km, fuel_issued_litres, driver_advance, toll_charges, freight_rate_per_tonne, total_freight_amount, status, weighbridge_slip_number, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ts.id,
            ts.slipNumber,
            ts.date || '2026-08-08',
            ts.time || null,
            ts.vehicleId || 'veh-1',
            ts.vehicleNumber || (ts as any).vehicleNo || 'MH-12-RN-8822',
            (ts as any).saleId || null,
            ts.orderId || null,
            ts.orderNumber || null,
            ts.driverId || 'dr-1',
            ts.tripType || 'outward',
            ts.partyId || null,
            ts.destination || 'Site',
            (ts as any).materialItemId || null,
            (ts as any).saleId ? null : (ts.materialName || 'Dense Bituminous Macadam'),
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

      // Seed documents + order document mapping tables
      for (const doc of (snapshot.documents || []) as any[]) {
        await conn.query(
          `REPLACE INTO documents (id, file_name, document_name, s3_key, url, content_type, size_bytes, uploaded_by_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            doc.id,
            doc.fileName || doc.name,
            doc.documentName || null,
            doc.s3Key,
            doc.url,
            doc.contentType || null,
            Number(doc.sizeBytes) || 0,
            doc.uploadedById || null,
            doc.status || 'active',
            doc.createdAt,
          ]
        );
      }
      for (const l of (snapshot.saleOrderDocuments || []) as any[]) {
        await conn.query(
          `REPLACE INTO sale_order_documents (id, sale_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
          [l.id, l.saleId, l.documentId, l.createdAt]
        );
      }
      for (const l of (snapshot.purchaseOrderDocuments || []) as any[]) {
        await conn.query(
          `REPLACE INTO purchase_order_documents (id, purchase_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
          [l.id, l.purchaseId, l.documentId, l.createdAt]
        );
      }
      for (const l of (snapshot.partyDocuments || []) as any[]) {
        await conn.query(
          `REPLACE INTO parties_documents (id, party_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
          [l.id, l.partyId, l.documentId, l.createdAt]
        );
      }
      for (const l of (snapshot.itemDocuments || []) as any[]) {
        await conn.query(
          `REPLACE INTO inventory_documents (id, item_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
          [l.id, l.itemId, l.documentId, l.createdAt]
        );
      }

      // Seed employee document mappings — same FK join shape as the other
      // features (Aadhaar/PAN verification scans linked to the employee)
      for (const l of (snapshot.employeeDocuments || []) as any[]) {
        await conn.query(
          `REPLACE INTO employee_documents (id, employee_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
          [l.id, l.employeeId, l.documentId, l.createdAt]
        );
      }

      // Seed employees
      for (const emp of (snapshot.employees || []) as any[]) {
        await conn.query(
          `REPLACE INTO employees (id, employee_code, name, designation, department, phone, email, date_of_joining, salary_type, base_salary, daily_wage_rate, bank_details, upi_address, name_on_account, default_in_time, default_out_time, aadhar_number, pan_number, status, emergency_contact, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            emp.upiAddress || (emp as any).upi_address || null,
            emp.nameOnAccount || (emp as any).name_on_account || null,
            emp.defaultInTime || (emp as any).default_in_time || null,
            emp.defaultOutTime || (emp as any).default_out_time || null,
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
          `REPLACE INTO employee_payments (id, employee_id, date, type, amount, payment_mode, account_id, reference_no, notes, month_year, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ep.id,
            ep.employeeId,
            ep.date,
            ep.type,
            ep.amount,
            ep.paymentMode,
            ep.accountId || null,
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
