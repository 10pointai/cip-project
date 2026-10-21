import { getMysqlPool, isMysqlConfigured } from './connection';
import { computeItemValuation } from '../inventoryValuation';
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
  AppDocument,
  SaleOrderDocumentLink,
  PurchaseOrderDocumentLink,
  PartyDocumentLink,
  ItemDocumentLink,
  EmployeeDocumentLink,
  DocumentStatus,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
  ItemStockAdjustment,
  StockMovementLog,
  Sale,
  Purchase,
  SalesOrderItem,
  SalesOrderStage,
  PurchaseOrderItem,
  PurchaseOrderStage,
  EmployeeLedgerTransaction,
} from '../../src/types';
import { DatabaseSchema, AuditLog, StockMovementRecord } from '../db';
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
      // 1. Settings — hydrate EVERY profile field the update path persists.
      // (Historical bug: this mapping dropped tagline, website and the five
      // registered-address columns, so each re-hydration silently reset them
      // to SEED and the address the user saved appeared never to persist.)
      // The 'default_settings' row is authoritative (updateDirect + snapshot
      // push both mint it); a stray legacy 'default' row is consolidated away.
      let settings: CompanySettings = { ...SEED_SETTINGS };
      const [settingRows]: [any[], any] = await conn.query(
        'SELECT * FROM company_settings ORDER BY (id = ?) DESC',
        ['default_settings'],
      );
      if (settingRows && settingRows.length > 0) {
        const s = settingRows[0];
        settings = {
          ...SEED_SETTINGS,
          companyName: s.company_name || SEED_SETTINGS.companyName,
          tradeName: s.trade_name || SEED_SETTINGS.tradeName,
          tagline: s.tagline || SEED_SETTINGS.tagline,
          gstin: s.gstin || SEED_SETTINGS.gstin,
          pan: s.pan || SEED_SETTINGS.pan,
          cin: s.cin || undefined,
          email: s.email || SEED_SETTINGS.email,
          phone: s.phone || SEED_SETTINGS.phone,
          website: s.website || SEED_SETTINGS.website,
          registeredAddress: {
            street: s.address_street || SEED_SETTINGS.registeredAddress.street,
            city: s.address_city || SEED_SETTINGS.registeredAddress.city,
            state: s.address_state || SEED_SETTINGS.registeredAddress.state,
            stateCode: s.address_state_code || SEED_SETTINGS.registeredAddress.stateCode,
            pincode: s.address_pincode || SEED_SETTINGS.registeredAddress.pincode,
          },
          invoiceNotes: s.invoice_notes || SEED_SETTINGS.invoiceNotes,
        };
        if (settingRows.length > 1) {
          await conn.query('DELETE FROM company_settings WHERE id <> ?', ['default_settings']);
        }
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

      // 4. Items — category NAME and unit STRING are LIVE VIEWS (Golden Rule §2):
      // resolved with JOINs against the item_categories / item_units masters so
      // renames propagate everywhere. Per-location stock is NOT stored here —
      // it is attached from item_location_mapping below.
      const [itemRows]: [any[], any] = await conn.query(
        `SELECT it.*, c.name AS category_display, u.code AS unit_display, u.name AS unit_name_display
         FROM items it
         LEFT JOIN item_categories c ON c.id = it.category_id
         LEFT JOIN item_units u ON u.id = it.unit_id
         ORDER BY it.name ASC`
      );
      const items: Item[] = itemRows.map((it) => ({
        id: it.id,
        name: it.name,
        code: it.code,
        type: it.type,
        categoryId: it.category_id,
        unitId: it.unit_id || undefined,
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
        // locations / stockLocations / stockLocation arrive from the
        // item_location_mapping JOIN below (no name copies on the items row)
        lastStockUpdate: it.last_stock_update || undefined,
        movements: parseJsonField(it.movements, []),
        createdAt: it.created_at,
        updatedAt: it.updated_at,
      }));

      // 4b. Load and attach normalized item location mappings
      try {
        // Location NAME resolved with a JOIN against the item_locations master
        // (no location_name copy in the mapping table).
        const [ilmRows]: [any[], any] = await conn.query(
          `SELECT m.*, ml.name AS location_display
           FROM item_location_mapping m
           LEFT JOIN item_locations ml ON ml.id = m.location_id
           ORDER BY location_display ASC`
        );
        const mappingByItem = new Map<string, any[]>();
        for (const m of ilmRows || []) {
          const list = mappingByItem.get(m.item_id) || [];
          list.push({
            locationId: m.location_id,
            locationName: m.location_display || undefined,
            openingStock: parseNum(m.opening_stock),
            currentStock: parseNum(m.current_stock),
            minStockLevel: parseNum(m.min_stock_level),
            maxCapacity: m.max_capacity !== null && m.max_capacity !== undefined ? parseNum(m.max_capacity) : undefined,
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

      // 4b-audit. Startup integrity audit (log-only): Σ(location buckets) must
      // equal the item's total — any drift means an increment lost its
      // location leg and is surfaced loudly the moment it happens.
      for (const item of items) {
        if (!item.locations || item.locations.length === 0) continue;
        const bucketSum = item.locations.reduce((sum, l) => sum + (Number(l.currentStock) || 0), 0);
        if (Math.abs(bucketSum - (Number(item.currentStock) || 0)) > 1e-9) {
          console.warn(
            `[Azure MySQL] STOCK AUDIT drift on item ${item.name} (${item.id}): ` +
            `total ${item.currentStock} ≠ location buckets ${bucketSum} ` +
            `[${item.locations.map((l) => `${l.locationName}:${l.currentStock}`).join(', ')}] — ` +
            `fix with a stock adjustment or the /api/accounts-style recalculation.`
          );
        }
      }

      // 4c. Stock movements ledger -> hydrate item.movements (latest 100 per item, newest first).
      // FK store: item_id / location_id / party_id only. Names are resolved with JOINs
      // so party/item renames always propagate into the movement ledger display.
      const stockMovements: StockMovementRecord[] = [];
      try {
        const [smRows]: [any[], any] = await conn.query(`
          SELECT sm.*, p.name AS party_display,
                 loc.name AS location_display
          FROM stock_movements sm
          LEFT JOIN parties p ON p.id = sm.party_id
          LEFT JOIN item_locations loc ON loc.id = sm.location_id
          
          ORDER BY sm.movement_date DESC, sm.created_at DESC
        `);
        const movsByItem = new Map<string, StockMovementLog[]>();
        for (const m of smRows || []) {
          stockMovements.push({
            id: m.id,
            itemId: m.item_id,
            locationId: m.location_id || undefined,
            locationName: m.location_display || undefined,
            partyId: m.party_id || undefined,
            partyName: m.party_display || undefined,
            date: m.movement_date || m.created_at,
            type: m.movement_type,
            quantity: parseNum(m.quantity),
            balanceAfter: m.balance_after !== null && m.balance_after !== undefined ? parseNum(m.balance_after) : 0,
            rate: m.rate !== null && m.rate !== undefined ? parseNum(m.rate) : undefined,
            movementValue: m.movement_value !== null && m.movement_value !== undefined ? parseNum(m.movement_value) : undefined,
            valuationRateAfter: m.valuation_rate_after !== null && m.valuation_rate_after !== undefined ? parseNum(m.valuation_rate_after) : undefined,
            referenceNumber: m.reference_number || undefined,
            referenceId: m.reference_id || undefined,
            sourcePartyOrBatch: m.party_display || undefined,
            notes: m.notes || undefined,
            referenceType: m.reference_type || undefined,
          } as StockMovementRecord);
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
          // FIFO actual-cost valuation, replayed from the FULL ledger
          // (not the 100-row display cap) at read time, server-side.
          const fullLedger = stockMovements.filter((m) => m.itemId === item.id);
          const valuation = computeItemValuation(item, fullLedger);
          if (valuation.valuationRate > 0) item.valuationRate = valuation.valuationRate;
          if (valuation.stockValue > 0) item.stockValue = valuation.stockValue;
        }
      } catch (smErr: any) {
        console.warn('[Azure MySQL] Notice loading stock_movements ledger:', smErr.message);
      }

      // 5. Transactions (filter out any orphaned transactions where party does not exist).
      // partyName AND accountName are LIVE VIEWS (Golden Rule §2): resolved with JOINs
      // against the parties / cash_bank_accounts masters at read time, so renames
      // update every voucher display. No name copies are stored on the row.
      const [txRows]: [any[], any] = await conn.query(
        `SELECT t.*, p.id AS party_exists, p.name AS party_display, acc.name AS account_display
         FROM transactions t
         LEFT JOIN parties p ON p.id = t.party_id
         LEFT JOIN cash_bank_accounts acc ON acc.id = t.account_id
         ORDER BY t.date DESC, t.created_at DESC`
      );
      const transactions: Transaction[] = txRows
        .filter((t) => t.party_exists !== null && t.party_exists !== undefined)
        .map((t) => ({
        id: t.id,
        voucherNumber: t.voucher_number,
        date: t.date,
        accountId: t.account_id || undefined,
        accountName: t.account_display || undefined,
        type: t.type,
        partyId: t.party_id,
        partyName: t.party_display || undefined,
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

      // 8b. SALES & PURCHASE — relational order model (Phase 1 redesign).
      // Masters JOIN the party master for the live display name; items and
      // stage-history rows are attached to each master (FKs only in storage).
      let sales: Sale[] = [];
      let purchases: Purchase[] = [];
      try {
        // --- SALES ---
        const [saleMasterRows]: [any[], any] = await conn.query(
          `SELECT so.*, p.name AS party_display,
                  acc.name AS settlement_account_display,
                  iv.voucher_number AS invoice_voucher_display,
                  sv.voucher_number AS settlement_voucher_display
           FROM sales_orders so
           LEFT JOIN parties p ON p.id = so.party_id
           LEFT JOIN cash_bank_accounts acc ON acc.id = so.settlement_account_id
           LEFT JOIN transactions iv ON iv.id = so.invoice_voucher_id
           LEFT JOIN transactions sv ON sv.id = so.settlement_voucher_id
           ORDER BY so.date DESC, so.created_at DESC`
        );
        const [saleItemRows]: [any[], any] = await conn.query(
          `SELECT soi.*, i.name AS item_name, i.code AS item_code,
                  u.code AS unit_display, loc.name AS location_display
           FROM sales_order_items soi
           LEFT JOIN items i ON i.id = soi.item_id
           LEFT JOIN item_units u ON u.id = soi.unit_id
           LEFT JOIN item_locations loc ON loc.id = soi.location_id`
        );
        const [saleStageRows]: [any[], any] = await conn.query(
          // Stage rows MUST come back in LADDER order, not date order — a
          // back-dated stage document (e.g. a PO dated before its RFQ) would
          // otherwise flip the array and every `stages[last]` "latest stage"
          // consumer (ladder guards, status computation, document cards).
          `SELECT * FROM sales_order_stages
           ORDER BY CASE stage_type
             WHEN 'quotation' THEN 0
             WHEN 'sales_order' THEN 1
             WHEN 'proforma_invoice' THEN 2
             WHEN 'delivery_note' THEN 3
             ELSE 4
           END ASC, created_at ASC, date ASC`
        );
        // Stage-scoped items: bucket key = saleId::stageId ('master' for
        // legacy rows without stage linkage). Each stage row carries its own
        // items; the sale master view = the effective (latest) stage's set.
        const saleItemsByBucket = new Map<string, SalesOrderItem[]>();
        for (const li of saleItemRows || []) {
          const key = `${li.sale_id}::${li.sales_order_stage_id || 'master'}`;
          const list = saleItemsByBucket.get(key) || [];
          list.push({
            id: li.id,
            saleId: li.sale_id,
            stageId: li.sales_order_stage_id || undefined,
            itemId: li.item_id,
            unitId: li.unit_id || undefined,
            itemName: li.item_name || undefined,
            itemCode: li.item_code || undefined,
            unit: li.unit_display || undefined,
            location: li.location_display || undefined,
            quantity: numOr(li.quantity),
            rate: numOr(li.rate),
            amount: numOr(li.quantity) * numOr(li.rate),
            gstRate: li.gst_rate !== null && li.gst_rate !== undefined ? numOr(li.gst_rate) : undefined,
            locationId: li.location_id || undefined,
            itemNotes: li.item_notes || undefined,
          });
          saleItemsByBucket.set(key, list);
        }
        const saleBucket = (saleId: string, stageId?: string) =>
          saleItemsByBucket.get(`${saleId}::${stageId || 'master'}`) || [];
        const saleStagesByMaster = new Map<string, SalesOrderStage[]>();
        for (const st of saleStageRows || []) {
          const list = saleStagesByMaster.get(st.sale_id) || [];
          list.push({
            id: st.id,
            saleId: st.sale_id,
            stageType: st.stage_type,
            stageNumber: st.stage_number,
            date: st.date,
            subtotal: numOr(st.subtotal),
            taxAmount: numOr(st.tax_amount),
            totalAmount: numOr(st.total_amount),
            notes: st.notes || undefined,
            createdAt: st.created_at,
          });
          saleStagesByMaster.set(st.sale_id, list);
        }
        sales = (saleMasterRows || []).map((so) => {
          const stages = (saleStagesByMaster.get(so.id) || []).map((st) => ({
            ...st,
            items: saleBucket(so.id, st.id),
          }));
          // Sale.items = effective (latest) stage's rows; legacy rows without
          // stage linkage fall back to the master bucket.
          const latestWithRows = [...stages].reverse().find((st) => (st.items || []).length > 0);
          const items = latestWithRows ? (latestWithRows.items as SalesOrderItem[]) : saleBucket(so.id);
          return {
            id: so.id,
            saleNumber: so.sale_number,
            partyId: so.party_id,
            partyName: so.party_display || undefined, // live view (§2)
            date: so.date,
            status: so.status || 'pending',
            notes: so.notes || undefined,
            vehicleNo: so.vehicle_no || undefined,
            driverName: so.driver_name || undefined,
            transportCharges: numOr(so.transport_charges),
            inventoryApplied: Boolean(so.inventory_applied),
            cashApplied: Boolean(so.cash_applied),
            settlementType: so.settlement_type || (so.settlement_voucher_id ? 'account' : undefined),
            settlementAccountId: so.settlement_account_id || undefined,
            settlementAccountName: so.settlement_account_display || undefined, // live view (§2)
            paymentMode: so.payment_mode || undefined,
            invoiceVoucherId: so.invoice_voucher_id || undefined,
            invoiceVoucherNumber: so.invoice_voucher_display || undefined, // live view (§2)
            settlementVoucherId: so.settlement_voucher_id || undefined,
            settlementVoucherNumber: so.settlement_voucher_display || undefined, // live view (§2)
            settledAmount: so.settled_amount !== null && so.settled_amount !== undefined ? numOr(so.settled_amount) : undefined,
            settledDate: so.settled_date || undefined,
            items,
            stages,
            createdAt: so.created_at,
            updatedAt: so.updated_at || so.created_at,
          };
        });

        // --- PURCHASES ---
        const [purMasterRows]: [any[], any] = await conn.query(
          `SELECT po.*, p.name AS party_display,
                  acc.name AS settlement_account_display,
                  iv.voucher_number AS invoice_voucher_display,
                  sv.voucher_number AS settlement_voucher_display
           FROM purchase_orders po
           LEFT JOIN parties p ON p.id = po.party_id
           LEFT JOIN cash_bank_accounts acc ON acc.id = po.settlement_account_id
           LEFT JOIN transactions iv ON iv.id = po.invoice_voucher_id
           LEFT JOIN transactions sv ON sv.id = po.settlement_voucher_id
           ORDER BY po.date DESC, po.created_at DESC`
        );
        const [purItemRows]: [any[], any] = await conn.query(
          `SELECT poi.*, i.name AS item_name, i.code AS item_code,
                  u.code AS unit_display, loc.name AS location_display
           FROM purchase_order_items poi
           LEFT JOIN items i ON i.id = poi.item_id
           LEFT JOIN item_units u ON u.id = poi.unit_id
           LEFT JOIN item_locations loc ON loc.id = poi.location_id`
        );
        const [purStageRows]: [any[], any] = await conn.query(
          // Ladder order (RFQ -> PO -> GRN) regardless of stage dates — a
          // back-dated edit must never reorder the stage documents.
          `SELECT * FROM purchase_order_stages
           ORDER BY CASE stage_type
             WHEN 'rfq' THEN 0
             WHEN 'purchase_order' THEN 1
             ELSE 2
           END ASC, created_at ASC, date ASC`
        );
        const purItemsByMaster = new Map<string, PurchaseOrderItem[]>();
        for (const li of purItemRows || []) {
          const list = purItemsByMaster.get(li.purchase_id) || [];
          list.push({
            id: li.id,
            purchaseId: li.purchase_id,
            itemId: li.item_id,
            unitId: li.unit_id || undefined,
            itemName: li.item_name || undefined,
            itemCode: li.item_code || undefined,
            unit: li.unit_display || undefined,
            location: li.location_display || undefined,
            quantity: numOr(li.quantity),
            rate: numOr(li.rate),
            amount: numOr(li.quantity) * numOr(li.rate),
            gstRate: li.gst_rate !== null && li.gst_rate !== undefined ? numOr(li.gst_rate) : undefined,
            locationId: li.location_id || undefined,
            receivedQuantity: li.received_quantity !== null && li.received_quantity !== undefined ? numOr(li.received_quantity) : undefined,
            shortageQuantity: li.shortage_quantity !== null && li.shortage_quantity !== undefined ? numOr(li.shortage_quantity) : undefined,
            overageQuantity: li.overage_quantity !== null && li.overage_quantity !== undefined ? numOr(li.overage_quantity) : undefined,
            itemNotes: li.item_notes || undefined,
          });
          purItemsByMaster.set(li.purchase_id, list);
        }
        const purStagesByMaster = new Map<string, PurchaseOrderStage[]>();
        for (const st of purStageRows || []) {
          const list = purStagesByMaster.get(st.purchase_id) || [];
          let details: any = null;
          try {
            details = typeof st.stage_details === 'string' ? JSON.parse(st.stage_details) : st.stage_details;
          } catch {
            details = null;
          }
          list.push({
            id: st.id,
            purchaseId: st.purchase_id,
            stageType: st.stage_type,
            stageNumber: st.stage_number,
            date: st.date,
            subtotal: numOr(st.subtotal),
            taxAmount: numOr(st.tax_amount),
            totalAmount: numOr(st.total_amount),
            rfqDetails: st.stage_type === 'rfq' ? details : undefined,
            poDetails: st.stage_type === 'purchase_order' ? details : undefined,
            receiptDetails: st.stage_type === 'goods_receipt' ? details : undefined,
            notes: st.notes || undefined,
            createdAt: st.created_at,
          });
          purStagesByMaster.set(st.purchase_id, list);
        }
        purchases = (purMasterRows || []).map((po) => ({
          id: po.id,
          purchaseNumber: po.purchase_number,
          partyId: po.party_id || undefined,
          partyName: po.party_display || undefined, // live view (§2)
          date: po.date,
          status: po.status || 'pending',
          notes: po.notes || undefined,
          inventoryApplied: Boolean(po.inventory_applied),
          cashApplied: Boolean(po.cash_applied),
          settlementType: po.settlement_type || (po.settlement_voucher_id ? 'account' : undefined),
          settlementAccountId: po.settlement_account_id || undefined,
          settlementAccountName: po.settlement_account_display || undefined, // live view (§2)
          paymentMode: po.payment_mode || undefined,
          invoiceVoucherId: po.invoice_voucher_id || undefined,
          invoiceVoucherNumber: po.invoice_voucher_display || undefined, // live view (§2)
          settlementVoucherId: po.settlement_voucher_id || undefined,
          settlementVoucherNumber: po.settlement_voucher_display || undefined, // live view (§2)
          settledAmount: po.settled_amount !== null && po.settled_amount !== undefined ? numOr(po.settled_amount) : undefined,
          settledDate: po.settled_date || undefined,
          items: purItemsByMaster.get(po.id) || [],
          stages: purStagesByMaster.get(po.id) || [],
          createdAt: po.created_at,
          updatedAt: po.updated_at || po.created_at,
        }));
      } catch (spErr: any) {
        console.warn('[Azure MySQL] Notice loading sales/purchase relational tables:', spErr.message);
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
        salaryBase: parseNum(e.base_salary) || parseNum(e.daily_wage_rate),
        salaryType: (e.salary_type as any) || 'monthly',
        status: (e.status as any) || 'active',
        bankAccountNo: (parseJsonField(e.bank_details, {}) as any).accountNumber || undefined,
        bankIFSC: (parseJsonField(e.bank_details, {}) as any).ifscCode || undefined,
        upiAddress: e.upi_address || undefined,
        nameOnAccount: e.name_on_account || undefined,
        defaultInTime: e.default_in_time || undefined,
        defaultOutTime: e.default_out_time || undefined,
        openingBalance: parseNum(e.opening_balance),
        createdAt: e.created_at,
      }));

      const [attRows]: [any[], any] = await conn.query('SELECT * FROM attendance ORDER BY date DESC');
      // employee_name resolved from the just-fetched employees list (the
      // attendance table no longer stores it)
      const empNameById = new Map(employees.map((e) => [e.id, e.name]));
      const attendance: EmployeeAttendance[] = attRows.map((a) => ({
        id: a.id,
        employeeId: a.employee_id,
        employeeName: empNameById.get(a.employee_id) || '',
        date: a.date,
        status: (a.status as any) || 'present',
        checkInTime: a.in_time || undefined,
        checkOutTime: a.out_time || undefined,
        totalHoursWorked: parseNum(a.work_hours),
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

      const [payRows]: [any[], any] = await conn.query(
        `SELECT ep.*, e.name AS employee_name, a.name AS account_name
         FROM employee_payments ep
         LEFT JOIN employees e ON e.id = ep.employee_id
         LEFT JOIN cash_bank_accounts a ON a.id = ep.account_id
         ORDER BY ep.created_at DESC`
      );
      const employeePayments: EmployeePayment[] = payRows.map((p) => ({
        id: p.id,
        employeeId: p.employee_id,
        employeeName: p.employee_name || undefined,
        date: p.date,
        type: (p.type as any) || 'salary',
        amount: parseNum(p.amount),
        paymentMode: (p.payment_mode as any) || 'bank_transfer',
        accountId: p.account_id || undefined,
        accountName: p.account_name || undefined,
        referenceNo: p.reference_no || undefined,
        notes: p.notes || undefined,
        monthYear: p.month_year || undefined,
      }));

      // 11b. Employee Ledger — FK-only rows; employee name JOINs from the master
      const [eltRows]: [any[], any] = await conn.query(
        `SELECT t.*, e.name AS employee_name, a.name AS account_name
         FROM employee_ledger_transactions t
         LEFT JOIN employees e ON e.id = t.employee_id
         LEFT JOIN cash_bank_accounts a ON a.id = t.account_id
         ORDER BY t.created_at DESC`
      );
      const employeeLedgerTransactions: EmployeeLedgerTransaction[] = eltRows.map((t: any) => ({
        id: t.id,
        employeeId: t.employee_id,
        employeeName: t.employee_name || undefined,
        date: t.date,
        type: (t.type as any) || 'add_balance',
        amount: parseNum(t.amount),
        reason: t.reason || '',
        accountId: t.account_id || undefined,
        accountName: t.account_name || undefined,
        direction: (t.direction as any) || undefined,
        intent: (t.intent as any) || undefined,
        source: (t.source as any) || 'manual',
        notes: t.notes || undefined,
        createdAt: t.created_at,
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
        // Names are resolved with JOINs against the account master so account
        // renames propagate to every transfer display (Golden Rule §2).
        const [trfRows]: [any[], any] = await conn.query(
          `SELECT tr.*, fa.name AS from_account_display, ta.name AS to_account_display
           FROM internal_transfers tr
           LEFT JOIN cash_bank_accounts fa ON fa.id = tr.from_account_id
           LEFT JOIN cash_bank_accounts ta ON ta.id = tr.to_account_id
           ORDER BY tr.date DESC, tr.created_at DESC`
        );
        transfers = trfRows.map((tr) => ({
          id: tr.id,
          transferNumber: tr.transfer_number,
          date: tr.date,
          fromAccountId: tr.from_account_id,
          fromAccountName: tr.from_account_display || undefined,
          toAccountId: tr.to_account_id,
          toAccountName: tr.to_account_display || undefined,
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
        // Account name/type resolved with JOINs (Golden Rule §2).
        const [adjRows]: [any[], any] = await conn.query(
          `SELECT aj.*, acc.name AS account_display, acc.type AS account_type_display
           FROM account_adjustments aj
           LEFT JOIN cash_bank_accounts acc ON acc.id = aj.account_id
           ORDER BY aj.date DESC, aj.created_at DESC`
        );
        adjustments = adjRows.map((ad) => ({
          id: ad.id,
          adjustmentNumber: ad.adjustment_number,
          accountId: ad.account_id,
          accountName: ad.account_display || undefined,
          accountType: ad.account_type_display || undefined,
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

      // 12b. Item Stock Adjustments (STK-ADJ vouchers) — names via JOIN, FKs only in storage
      let stockAdjustments: ItemStockAdjustment[] = [];
      try {
        const [isaRows]: [any[], any] = await conn.query(`
          SELECT a.*, i.name AS item_name, i.code AS item_code,
                 u.code AS item_unit_display, u.name AS item_unit_name,
                 COALESCE(loc.name) AS location_display
          FROM item_stock_adjustments a
          LEFT JOIN items i ON i.id = a.item_id
          LEFT JOIN item_units u ON u.id = i.unit_id
          LEFT JOIN item_locations loc ON loc.id = a.location_id
          ORDER BY a.created_at DESC, a.adjustment_date DESC
        `);
        stockAdjustments = (isaRows || []).map((a) => ({
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
      } catch (isaErr: any) {
        console.warn('[Azure MySQL] Notice querying item_stock_adjustments:', isaErr.message);
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

      // Documents + order mapping tables (S3 upload records + pure FK joins)
      const [documentRows]: any[] = await conn.query(
        'SELECT * FROM documents ORDER BY created_at DESC'
      );
      const documents: AppDocument[] = (documentRows || []).map((d: any) => ({
        id: d.id,
        fileName: d.file_name || d.name,
        documentName: d.document_name || undefined,
        s3Key: d.s3_key,
        url: d.url,
        contentType: d.content_type || undefined,
        sizeBytes: Number(d.size_bytes) || 0,
        uploadedById: d.uploaded_by_id || undefined,
        status: (d.status as DocumentStatus) || 'active',
        createdAt: d.created_at,
      }));
      const [saleDocRows]: any[] = await conn.query(
        'SELECT * FROM sale_order_documents ORDER BY created_at ASC'
      );
      const saleOrderDocuments: SaleOrderDocumentLink[] = (saleDocRows || []).map((l: any) => ({
        id: l.id,
        saleId: l.sale_id,
        documentId: l.document_id,
        createdAt: l.created_at,
      }));
      const [purchaseDocRows]: any[] = await conn.query(
        'SELECT * FROM purchase_order_documents ORDER BY created_at ASC'
      );
      const purchaseOrderDocuments: PurchaseOrderDocumentLink[] = (purchaseDocRows || []).map((l: any) => ({
        id: l.id,
        purchaseId: l.purchase_id,
        documentId: l.document_id,
        createdAt: l.created_at,
      }));
      const [partyDocRows]: any[] = await conn.query(
        'SELECT * FROM parties_documents ORDER BY created_at ASC'
      );
      const partyDocuments: PartyDocumentLink[] = (partyDocRows || []).map((l: any) => ({
        id: l.id,
        partyId: l.party_id,
        documentId: l.document_id,
        createdAt: l.created_at,
      }));
      const [itemDocRows]: any[] = await conn.query(
        'SELECT * FROM inventory_documents ORDER BY created_at ASC'
      );
      const itemDocuments: ItemDocumentLink[] = (itemDocRows || []).map((l: any) => ({
        id: l.id,
        itemId: l.item_id,
        documentId: l.document_id,
        createdAt: l.created_at,
      }));
      const [employeeDocRows]: any[] = await conn.query(
        'SELECT * FROM employee_documents ORDER BY created_at ASC'
      );
      const employeeDocuments: EmployeeDocumentLink[] = (employeeDocRows || []).map((l: any) => ({
        id: l.id,
        employeeId: l.employee_id,
        documentId: l.document_id,
        createdAt: l.created_at,
      }));

      if (!settings) {
        return null;
      }

      console.log(`[Azure MySQL] Loaded live data from Azure: ${parties.length} parties, ${items.length} items, ${transactions.length} transactions, ${accounts.length} accounts, ${sales.length} sales, ${purchases.length} purchases, ${orders.length} legacy orders.`);

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
        sales,
        purchases,
        vehicles,
        drivers,
        tripSlips,
        tyres,
        employees,
        attendance,
        leaves,
        employeePayments,
        employeeLedgerTransactions,
        accounts,
        transfers,
        adjustments,
        stockAdjustments,
        stockMovements,
        documents,
        saleOrderDocuments,
        purchaseOrderDocuments,
        partyDocuments,
        itemDocuments,
        employeeDocuments,
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

/**
 * Resolve an item_units FK from the unit code the UI already stores on the
 * item (matched case/trim-insensitively against code, then name). Returns
 * null when the unit code is not a known master unit — callers keep the
 * legacy display string in that case, and the migration reports unmatched rows.
 */
export async function resolveUnitIdByCode(unitCode?: string | null): Promise<string | null> {
  const code = (unitCode || '').trim();
  if (!code || !getMysqlPool()) return null;
  try {
    const [rows]: any = await getMysqlPool()!.query(
      `SELECT id FROM item_units
       WHERE LOWER(TRIM(code)) = LOWER(?) OR LOWER(TRIM(name)) = LOWER(?)
       LIMIT 1`,
      [code.toLowerCase(), code.toLowerCase()]
    );
    return (rows || [])[0]?.id || null;
  } catch {
    return null;
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
      // FK store (Golden Rule §2): no category_name / unit / location names are
      // saved on the items row — categoryId + unit_id only. The display strings
      // are resolved with JOINs at read time, and per-location stock lives ONLY
      // in item_location_mapping (written below with FKs + numeric stock).
      const unitId = await resolveUnitIdByCode(item.unit);
      await pool.query(
        `REPLACE INTO items (
          id, name, code, type, category_id, unit_id, hsn_sac_code,
          tax_rate_gst, sale_price, purchase_price, opening_stock, opening_stock_price,
          opening_stock_date, technical_specs, remarks, is_active, current_stock,
          min_stock_level, max_capacity, last_stock_update, movements, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          null,
          item.createdAt || new Date().toISOString(),
          item.updatedAt || new Date().toISOString(),
        ]
      );

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
                id, item_id, location_id, max_capacity, opening_stock, current_stock, min_stock_level, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                mappingId,
                item.id,
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
        // FKs only (Golden Rule §2): no party_name/account_name copies stored.
        `REPLACE INTO transactions (id, voucher_number, date, account_id, type, party_id, amount, payment_mode, reference_number, material_or_service, quantity_tonnes, description, status, due_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txn.id,
          txn.voucherNumber,
          txn.date,
          txn.accountId || null,
          txn.type,
          txn.partyId,
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

// -------------------------------------------------------------
// SALES & PURCHASE — RELATIONAL ORDER MODEL (Phase 1 redesign).
// Masters + items + stage-history child tables; FKs only (Golden Rule §2) —
// party / item / unit / location display names are JOINed at read time.
// -------------------------------------------------------------

function numOr(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function liveSyncSale(sale: Sale, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(
      `REPLACE INTO sales_orders (id, sale_number, party_id, date, status, notes, vehicle_no, driver_name, transport_charges, inventory_applied, cash_applied, settlement_type, settlement_account_id, payment_mode, invoice_voucher_id, settlement_voucher_id, settled_amount, settled_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.id,
        sale.saleNumber,
        sale.partyId,
        sale.date,
        sale.status || 'pending',
        sale.notes || null,
        sale.vehicleNo || null,
        sale.driverName || null,
        numOr(sale.transportCharges),
        sale.inventoryApplied ? 1 : 0,
        sale.cashApplied ? 1 : 0,
        (sale as any).settlementType || null,
        sale.settlementAccountId || null,
        sale.paymentMode || null,
        sale.invoiceVoucherId || null,
        sale.settlementVoucherId || null,
        sale.settledAmount !== undefined && sale.settledAmount !== null ? sale.settledAmount : null,
        sale.settledDate || null,
        sale.createdAt || new Date().toISOString(),
        sale.updatedAt || new Date().toISOString(),
      ]
    );
    if (isDelete) {
      await pool.query('DELETE FROM sales_order_items WHERE sale_id = ?', [sale.id]);
      await pool.query('DELETE FROM sales_order_stages WHERE sale_id = ?', [sale.id]);
      await pool.query('DELETE FROM sales_orders WHERE id = ?', [sale.id]);
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync sale:', e.message);
  }
}

export async function liveSyncSaleItems(saleId: string, items: SalesOrderItem[], isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM sales_order_items WHERE sale_id = ?', [saleId]);
      return;
    }
    // Master edits regenerate line ids — remove child rows that are no longer
    // part of the current line set before replacing (no stale dup rows).
    const ids = (items || []).map((li) => li.id);
    if (ids.length === 0) {
      await pool.query('DELETE FROM sales_order_items WHERE sale_id = ?', [saleId]);
    } else {
      const ph = ids.map(() => '?').join(',');
      await pool.query(`DELETE FROM sales_order_items WHERE sale_id = ? AND id NOT IN (${ph})`, [saleId, ...ids]);
    }
    for (const li of items || []) {
      await pool.query(
        `REPLACE INTO sales_order_items (id, sale_id, sales_order_stage_id, item_id, unit_id, quantity, rate, gst_rate, location_id, item_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          li.id,
          saleId,
          li.stageId || null,
          li.itemId,
          li.unitId || null,
          numOr(li.quantity),
          numOr(li.rate),
          li.gstRate ?? null,
          li.locationId || null,
          li.itemNotes || null,
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync sale items:', e.message);
  }
}

export async function liveSyncSaleStages(saleId: string, stages: SalesOrderStage[], isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM sales_order_stages WHERE sale_id = ?', [saleId]);
      return;
    }
    for (const st of stages || []) {
      await pool.query(
        `REPLACE INTO sales_order_stages (id, sale_id, stage_type, stage_number, date, subtotal, tax_amount, total_amount, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          st.id,
          saleId,
          st.stageType,
          st.stageNumber,
          st.date,
          numOr(st.subtotal),
          numOr(st.taxAmount),
          numOr(st.totalAmount),
          st.notes || null,
          st.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync sale stages:', e.message);
  }
}

export async function liveSyncPurchase(purchase: Purchase, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(
      `REPLACE INTO purchase_orders (id, purchase_number, party_id, date, status, notes, inventory_applied, cash_applied, settlement_type, settlement_account_id, payment_mode, invoice_voucher_id, settlement_voucher_id, settled_amount, settled_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchase.id,
        purchase.purchaseNumber,
        purchase.partyId || null,
        purchase.date,
        purchase.status || 'pending',
        purchase.notes || null,
        purchase.inventoryApplied ? 1 : 0,
        purchase.cashApplied ? 1 : 0,
        (purchase as any).settlementType || null,
        purchase.settlementAccountId || null,
        purchase.paymentMode || null,
        purchase.invoiceVoucherId || null,
        purchase.settlementVoucherId || null,
        purchase.settledAmount !== undefined && purchase.settledAmount !== null ? purchase.settledAmount : null,
        purchase.settledDate || null,
        purchase.createdAt || new Date().toISOString(),
        purchase.updatedAt || new Date().toISOString(),
      ]
    );
    if (isDelete) {
      await pool.query('DELETE FROM purchase_order_items WHERE purchase_id = ?', [purchase.id]);
      await pool.query('DELETE FROM purchase_order_stages WHERE purchase_id = ?', [purchase.id]);
      await pool.query('DELETE FROM purchase_orders WHERE id = ?', [purchase.id]);
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync purchase:', e.message);
  }
}

export async function liveSyncPurchaseItems(purchaseId: string, items: PurchaseOrderItem[], isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM purchase_order_items WHERE purchase_id = ?', [purchaseId]);
      return;
    }
    // Master edits regenerate line ids — remove child rows that are no longer
    // part of the current line set before replacing (no stale dup rows).
    const ids = (items || []).map((li) => li.id);
    if (ids.length === 0) {
      await pool.query('DELETE FROM purchase_order_items WHERE purchase_id = ?', [purchaseId]);
    } else {
      const ph = ids.map(() => '?').join(',');
      await pool.query(`DELETE FROM purchase_order_items WHERE purchase_id = ? AND id NOT IN (${ph})`, [purchaseId, ...ids]);
    }
    for (const li of items || []) {
      await pool.query(
        `REPLACE INTO purchase_order_items (id, purchase_id, item_id, unit_id, quantity, rate, gst_rate, location_id, received_quantity, shortage_quantity, overage_quantity, item_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          li.id,
          purchaseId,
          li.itemId,
          li.unitId || null,
          numOr(li.quantity),
          numOr(li.rate),
          li.gstRate ?? null,
          li.locationId || null,
          li.receivedQuantity ?? null,
          li.shortageQuantity ?? null,
          li.overageQuantity ?? null,
          li.itemNotes || null,
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync purchase items:', e.message);
  }
}

export async function liveSyncPurchaseStages(purchaseId: string, stages: PurchaseOrderStage[], isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM purchase_order_stages WHERE purchase_id = ?', [purchaseId]);
      return;
    }
    for (const st of stages || []) {
      const details = st.rfqDetails || st.poDetails || st.receiptDetails || null;
      await pool.query(
        `REPLACE INTO purchase_order_stages (id, purchase_id, stage_type, stage_number, date, subtotal, tax_amount, total_amount, stage_details, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          st.id,
          purchaseId,
          st.stageType,
          st.stageNumber,
          st.date,
          numOr(st.subtotal),
          numOr(st.taxAmount),
          numOr(st.totalAmount),
          details ? JSON.stringify(details) : null,
          st.notes || null,
          st.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync purchase stages:', e.message);
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
        `REPLACE INTO employees (id, employee_code, name, designation, department, phone, email, date_of_joining, salary_type, base_salary, daily_wage_rate, opening_balance, bank_details, upi_address, name_on_account, default_in_time, default_out_time, aadhar_number, pan_number, status, emergency_contact, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          emp.salaryBase,
          emp.salaryType === 'daily' ? emp.salaryBase : 0,
          emp.openingBalance || 0,
          JSON.stringify({ accountNumber: emp.bankAccountNo, ifscCode: emp.bankIFSC }),
          emp.upiAddress || null,
          emp.nameOnAccount || null,
          emp.defaultInTime || null,
          emp.defaultOutTime || null,
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
        `REPLACE INTO attendance (id, employee_id, date, status, in_time, out_time, work_hours, overtime_hours, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          att.id,
          att.employeeId,
          att.date,
          att.status,
          att.checkInTime || null,
          att.checkOutTime || null,
          att.totalHoursWorked || 0,
          0,
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
      // employee_name is NOT persisted — the display name JOINs from the
      // employees master at read time (FK-only, Golden Rule §2)
      await pool.query(
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
          ep.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync payment:', e.message);
  }
}

// Employee ledger rows: FK-only employee_id/account_id — both display names
// JOIN from their masters at read time (Golden Rule §2)
export async function liveSyncEmployeeLedgerTransaction(t: EmployeeLedgerTransaction, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM employee_ledger_transactions WHERE id = ?', [t.id]);
    } else {
      await pool.query(
        `REPLACE INTO employee_ledger_transactions (id, employee_id, date, type, amount, reason, account_id, direction, intent, source, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.employeeId,
          t.date,
          t.type,
          t.amount,
          t.reason,
          t.accountId || null,
          t.direction || null,
          (t as any).intent || null,
          t.source || 'manual',
          t.notes || null,
          t.createdAt || new Date().toISOString(),
        ]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync employee ledger transaction:', e.message);
  }
}

export async function liveSyncSettings(s: CompanySettings) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    // Single canonical row id ('default_settings' — same as the direct
    // update + snapshot-push paths, which both mint it). The historical
    // 'default' id created a second competing row that made `SELECT LIMIT 1`
    // nondeterministic; hydration now consolidates stray older rows.
    // tagline is written here too — omitting it REPLACE-deleted the value.
    await pool.query(
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

export async function liveSyncDocument(doc: AppDocument, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM documents WHERE id = ?', [doc.id]);
    } else {
      await pool.query(
        `REPLACE INTO documents (
          id, file_name, document_name, s3_key, url, content_type, size_bytes, uploaded_by_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          doc.fileName,
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
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync document:', e.message);
  }
}

export async function liveSyncSaleOrderDocLink(link: SaleOrderDocumentLink, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM sale_order_documents WHERE id = ?', [link.id]);
    } else {
      await pool.query(
        `REPLACE INTO sale_order_documents (id, sale_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
        [link.id, link.saleId, link.documentId, link.createdAt]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync sale document link:', e.message);
  }
}

export async function liveSyncPurchaseOrderDocLink(link: PurchaseOrderDocumentLink, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM purchase_order_documents WHERE id = ?', [link.id]);
    } else {
      await pool.query(
        `REPLACE INTO purchase_order_documents (id, purchase_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
        [link.id, link.purchaseId, link.documentId, link.createdAt]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync purchase document link:', e.message);
  }
}

export async function liveSyncPartyDocLink(link: PartyDocumentLink, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM parties_documents WHERE id = ?', [link.id]);
    } else {
      await pool.query(
        `REPLACE INTO parties_documents (id, party_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
        [link.id, link.partyId, link.documentId, link.createdAt]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync party document link:', e.message);
  }
}

export async function liveSyncItemDocLink(link: ItemDocumentLink, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM inventory_documents WHERE id = ?', [link.id]);
    } else {
      await pool.query(
        `REPLACE INTO inventory_documents (id, item_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
        [link.id, link.itemId, link.documentId, link.createdAt]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync item document link:', e.message);
  }
}

export async function liveSyncEmployeeDocLink(link: EmployeeDocumentLink, isDelete = false) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM employee_documents WHERE id = ?', [link.id]);
    } else {
      await pool.query(
        `REPLACE INTO employee_documents (id, employee_id, document_id, created_at) VALUES (?, ?, ?, ?)`,
        [link.id, link.employeeId, link.documentId, link.createdAt]
      );
    }
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync employee document link:', e.message);
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
      // Stores account FKs only (Golden Rule, documentation §2); from/to account
      // display names are resolved with JOINs at read time so renames propagate.
      await pool.query(
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
      // Stores the account FK only (Golden Rule, documentation §2); account
      // display name/type are resolved with JOINs at read time so renames propagate.
      await pool.query(
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
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync adjustment:', e.message);
  }
}


export async function liveSyncStockAdjustment(adj: ItemStockAdjustment, isDelete = false, locationId?: string) {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    if (isDelete) {
      await pool.query('DELETE FROM item_stock_adjustments WHERE id = ?', [adj.id]);
    } else {
      // Stores FKs only (item_id, location_id); item name/code/unit and location
      // display name are resolved with JOINs at read time so renames propagate.
      await pool.query(
        `REPLACE INTO item_stock_adjustments (id, adjustment_number, item_id, location_id, adjustment_date, adjustment_type, quantity, rate, total_value, previous_stock, new_stock, reason, reference_number, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adj.id,
          adj.adjustmentNumber,
          adj.itemId,
          locationId || null,
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
  } catch (e: any) {
    console.error('[Azure MySQL LiveSync] Failed to sync stock adjustment:', e.message);
  }
}

/**
 * Appends a stock movement to the ledger and applies the delta atomically:
 *  - INSERT into stock_movements (append-only history; stores FKs only)
 *  - UPDATE items.current_stock  -> atomic in-place increment (no lost-update race)
 *  - UPDATE item_location_mapping.current_stock -> atomic per-location increment
 * Never does a full-row REPLACE of the items row, so concurrent stock changes
 * from orders, adjustments, and production cannot overwrite each other.
 * The ledger stores primary keys (item_id, location_id, party_id) — display names
 * are always resolved with JOINs at read time, so renames propagate everywhere.
 */
export async function liveSyncStockMovement(item: Item, movement: StockMovementRecord, locationName?: string, partyId?: string) {
  const pool = getMysqlPool();
  if (!pool) return;
  const delta = Number(movement.quantity) || 0;
  try {
    await pool.query(
      `INSERT INTO stock_movements (
        id, item_id, location_id, movement_type, quantity,
        balance_after, rate, movement_value, valuation_rate_after,
        reference_type, reference_number, reference_id, party_id, notes, movement_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movement.id,
        item.id,
        movement.locationId || null,
        movement.type,
        delta,
        movement.balanceAfter !== undefined && movement.balanceAfter !== null ? Number(movement.balanceAfter) : null,
        movement.rate !== undefined && movement.rate !== null ? Number(movement.rate) : null,
        movement.movementValue !== undefined && movement.movementValue !== null ? Number(movement.movementValue) : null,
        movement.valuationRateAfter !== undefined && movement.valuationRateAfter !== null ? Number(movement.valuationRateAfter) : null,
        movement.referenceType || null,
        movement.referenceNumber || null,
        movement.referenceId || null,
        movement.partyId || null,
        movement.notes || null,
        movement.date,
        movement.date,
      ]
    );

    // Atomic item-level stock increment (single statement, race-safe)
    const [updateRes]: any = await pool.query(
      `UPDATE items SET current_stock = current_stock + ?, last_stock_update = ?, updated_at = ? WHERE id = ?`,
      [delta, item.lastStockUpdate || new Date().toISOString(), item.updatedAt || new Date().toISOString(), item.id]
    );

    // Row missing (item created in-memory but its create REPLACE hasn't landed yet):
    // fall back to a full-row write carrying the already-incremented memory state.
    if (!updateRes.affectedRows) {
      console.warn(`[Azure MySQL LiveSync] stock movement: items row ${item.id} missing, falling back to liveSyncItem REPLACE`);
      await liveSyncItem(item);
    }

    // Atomic per-location increment
    if (movement.locationId || locationName?.trim()) {
      const fallbackLocId = `loc-${locationName!.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const locId = movement.locationId || fallbackLocId;
      const now = new Date().toISOString();
      const [locRes]: any = await pool.query(
        `UPDATE item_location_mapping SET current_stock = current_stock + ?, updated_at = ? WHERE item_id = ? AND location_id = ?`,
        [delta, now, item.id, locId]
      );
      if (!locRes.affectedRows && delta > 0) {
        await pool.query(
          `INSERT IGNORE INTO item_location_mapping (id, item_id, location_id, opening_stock, current_stock, min_stock_level, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`ilm-${item.id}-${locId}`, item.id, locId, 0, delta, 0, now, now]
        );
      }
    }
  } catch (e: any) {
    // NEVER lose a stock effect silently: if the ledger insert fails (missing
    // column / table shape drift), fall back to writing the full item row so
    // the stock level and movement history remain visible, and surface it loudly.
    console.error('[Azure MySQL LiveSync] Failed to record stock movement:', e.message);
    if (!isMysqlConfigured()) return;
    try {
      console.warn('[Azure MySQL LiveSync] Falling back to liveSyncItem full-row write for item', item.id);
      await liveSyncItem(item);
    } catch (fallbackErr: any) {
      console.error('[Azure MySQL LiveSync] Stock movement fallback ALSO failed:', fallbackErr.message);
    }
  }
}
