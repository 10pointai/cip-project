import { executeMysqlQuery, executeMysqlOne, executeMysqlTransaction } from './queryClient';
import { isMysqlConfigured } from './connection';
import { Party, Transaction, CashBankAccount, InternalTransfer, AccountAdjustment } from '../../src/types';
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

function mapTransactionRow(t: any): Transaction {
  return {
    id: t.id,
    voucherNumber: t.voucher_number,
    date: t.date,
    accountId: t.account_id || undefined,
    accountName: t.account_name || undefined,
    type: t.type,
    partyId: t.party_id,
    partyName: t.party_name,
    partyType: (t.party_type || 'customer') as any,
    amount: parseNum(t.amount),
    paymentMode: t.payment_mode || undefined,
    referenceNumber: t.reference_number || undefined,
    materialOrService: t.material_or_service || undefined,
    quantityTonnes: t.quantity_tonnes !== null && t.quantity_tonnes !== undefined ? parseNum(t.quantity_tonnes) : undefined,
    description: t.description || '',
    status: t.status || 'paid',
    dueDate: t.due_date || undefined,
    createdAt: t.created_at,
  };
}

function mapPartyRow(p: any): Party {
  return {
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
  };
}

function mapAccountRow(a: any): CashBankAccount {
  return {
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
    updatedAt: a.updated_at,
  };
}

// =========================================================================
// TRANSACTIONS
// =========================================================================

export async function fetchTransactionsDirect(filter: { partyId?: string; type?: string; status?: string }): Promise<Transaction[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getTransactions(filter);
  }

  let sql = 'SELECT * FROM transactions WHERE party_id IN (SELECT id FROM parties)';
  const params: any[] = [];

  if (filter.partyId) {
    sql += ' AND party_id = ?';
    params.push(filter.partyId);
  }
  if (filter.type) {
    sql += ' AND type = ?';
    params.push(filter.type);
  }
  if (filter.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  sql += ' ORDER BY date DESC, created_at DESC';

  const rows = await executeMysqlQuery(sql, params);
  return rows.map(mapTransactionRow);
}

export async function fetchTransactionByIdDirect(id: string): Promise<Transaction | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getTransactionById(id) || null;
  }
  const row = await executeMysqlOne('SELECT * FROM transactions WHERE id = ?', [id]);
  return row ? mapTransactionRow(row) : null;
}

export async function deleteTransactionDirect(id: string): Promise<boolean> {
  if (!isMysqlConfigured()) {
    return serverDb.deleteTransaction(id);
  }

  return await executeMysqlTransaction(async (conn) => {
    const [rows]: any = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [id]);
    if (!rows || rows.length === 0) {
      return false;
    }

    const t = rows[0];
    const amount = parseNum(t.amount);
    const type = t.type;
    const partyId = t.party_id;
    const accountId = t.account_id;

    // Reverse party balance
    if (partyId) {
      let delta = 0;
      if (type === 'sale_invoice' || type === 'debit_note') {
        delta = -amount;
      } else if (type === 'payment_in' || type === 'receipt' || type === 'credit_note') {
        delta = amount;
      } else if (type === 'purchase_bill') {
        delta = amount;
      } else if (type === 'payment_out' || type === 'payment') {
        delta = -amount;
      }

      if (delta !== 0) {
        await conn.query('UPDATE parties SET current_balance = current_balance + ? WHERE id = ?', [delta, partyId]);
      }
    }

    // Reverse account balance
    if (accountId) {
      let accDelta = 0;
      if (type === 'payment_in' || type === 'sale_invoice' || type === 'receipt') {
        accDelta = -amount;
      } else if (type === 'payment_out' || type === 'purchase_bill' || type === 'payment') {
        accDelta = amount;
      }
      if (accDelta !== 0) {
        await conn.query('UPDATE cash_bank_accounts SET current_balance = current_balance + ? WHERE id = ?', [accDelta, accountId]);
      }
    }

    await conn.query('DELETE FROM transactions WHERE id = ?', [id]);
    serverDb.deleteTransaction(id);
    return true;
  });
}

// =========================================================================
// PARTIES
// =========================================================================

export async function fetchPartiesDirect(filter: { type?: string; category?: string; query?: string }): Promise<Party[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getParties(filter);
  }

  let sql = 'SELECT * FROM parties WHERE 1=1';
  const params: any[] = [];

  if (filter.type) {
    sql += ' AND type = ?';
    params.push(filter.type);
  }
  if (filter.category) {
    sql += ' AND category = ?';
    params.push(filter.category);
  }
  if (filter.query) {
    sql += ' AND (name LIKE ? OR trade_name LIKE ? OR phone LIKE ? OR gstin LIKE ?)';
    const qWildcard = `%${filter.query}%`;
    params.push(qWildcard, qWildcard, qWildcard, qWildcard);
  }

  sql += ' ORDER BY name ASC';
  const rows = await executeMysqlQuery(sql, params);
  return rows.map(mapPartyRow);
}

export async function fetchPartyByIdDirect(id: string): Promise<Party | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getPartyById(id) || null;
  }
  const row = await executeMysqlOne('SELECT * FROM parties WHERE id = ?', [id]);
  return row ? mapPartyRow(row) : null;
}

export async function createPartyDirect(partyData: any): Promise<Party> {
  const created = serverDb.createParty(partyData);
  if (!isMysqlConfigured()) {
    return created;
  }

  await executeMysqlQuery(
    `INSERT INTO parties (
      id, name, trade_name, type, category, gstin, pan, contact_person, phone, email,
      address, payment_terms_days, credit_limit, opening_balance, opening_balance_type,
      current_balance, notes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), trade_name=VALUES(trade_name), type=VALUES(type), category=VALUES(category),
      gstin=VALUES(gstin), pan=VALUES(pan), contact_person=VALUES(contact_person), phone=VALUES(phone),
      email=VALUES(email), address=VALUES(address), payment_terms_days=VALUES(payment_terms_days),
      credit_limit=VALUES(credit_limit), opening_balance=VALUES(opening_balance),
      current_balance=VALUES(current_balance), notes=VALUES(notes), is_active=VALUES(is_active),
      updated_at=VALUES(updated_at)`,
    [
      created.id,
      created.name,
      created.tradeName || null,
      created.type,
      created.category,
      created.gstin || null,
      created.pan || null,
      created.contactPerson || null,
      created.phone || null,
      created.email || null,
      JSON.stringify(created.address || {}),
      created.paymentTermsDays || 30,
      created.creditLimit || 0,
      created.openingBalance || 0,
      created.openingBalanceType || 'to_receive',
      created.currentBalance || 0,
      created.notes || null,
      created.isActive ?? true,
      created.createdAt,
      created.updatedAt || created.createdAt,
    ]
  );
  return created;
}

export async function updatePartyDirect(id: string, updates: any): Promise<Party> {
  const updated = serverDb.updateParty(id, updates);
  if (!isMysqlConfigured()) {
    return updated;
  }

  await executeMysqlQuery(
    `UPDATE parties SET
      name = COALESCE(?, name),
      trade_name = COALESCE(?, trade_name),
      type = COALESCE(?, type),
      category = COALESCE(?, category),
      gstin = COALESCE(?, gstin),
      pan = COALESCE(?, pan),
      contact_person = COALESCE(?, contact_person),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      address = COALESCE(?, address),
      payment_terms_days = COALESCE(?, payment_terms_days),
      credit_limit = COALESCE(?, credit_limit),
      notes = COALESCE(?, notes),
      is_active = COALESCE(?, is_active),
      updated_at = ?
    WHERE id = ?`,
    [
      updates.name || null,
      updates.tradeName || null,
      updates.type || null,
      updates.category || null,
      updates.gstin || null,
      updates.pan || null,
      updates.contactPerson || null,
      updates.phone || null,
      updates.email || null,
      updates.address ? JSON.stringify(updates.address) : null,
      updates.paymentTermsDays !== undefined ? updates.paymentTermsDays : null,
      updates.creditLimit !== undefined ? updates.creditLimit : null,
      updates.notes || null,
      updates.isActive !== undefined ? updates.isActive : null,
      new Date().toISOString(),
      id,
    ]
  );
  return updated;
}

export async function deletePartyDirect(id: string): Promise<boolean> {
  const deleted = serverDb.deleteParty(id);
  if (!isMysqlConfigured()) {
    return deleted;
  }
  await executeMysqlQuery('DELETE FROM transactions WHERE party_id = ?', [id]);
  await executeMysqlQuery('DELETE FROM parties WHERE id = ?', [id]);
  return true;
}

// =========================================================================
// ACCOUNTS & CASH/BANK
// =========================================================================

export async function fetchAccountsDirect(): Promise<CashBankAccount[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getAccounts();
  }
  const rows = await executeMysqlQuery('SELECT * FROM cash_bank_accounts ORDER BY name ASC');
  return rows.map(mapAccountRow);
}

export async function fetchAccountByIdDirect(id: string): Promise<CashBankAccount | null> {
  if (!isMysqlConfigured()) {
    return serverDb.getAccountById(id) || null;
  }
  const row = await executeMysqlOne('SELECT * FROM cash_bank_accounts WHERE id = ?', [id]);
  return row ? mapAccountRow(row) : null;
}

export async function fetchTransfersDirect(): Promise<InternalTransfer[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getTransfers();
  }
  const rows = await executeMysqlQuery('SELECT * FROM internal_transfers ORDER BY date DESC, created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    transferNumber: r.transfer_number,
    date: r.date,
    fromAccountId: r.from_account_id,
    fromAccountName: r.from_account_name,
    toAccountId: r.to_account_id,
    toAccountName: r.to_account_name,
    transferType: r.transfer_type,
    amount: parseNum(r.amount),
    referenceNumber: r.reference_number || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at,
  }));
}

export async function fetchAdjustmentsDirect(): Promise<AccountAdjustment[]> {
  if (!isMysqlConfigured()) {
    return serverDb.getAdjustments();
  }
  const rows = await executeMysqlQuery('SELECT * FROM account_adjustments ORDER BY date DESC, created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    adjustmentNumber: r.adjustment_number,
    accountId: r.account_id,
    accountName: r.account_name,
    accountType: r.account_type,
    date: r.date,
    type: r.type,
    amount: parseNum(r.amount),
    previousBalance: parseNum(r.previous_balance),
    newBalance: parseNum(r.new_balance),
    reason: r.reason,
    referenceNumber: r.reference_number || undefined,
    notes: r.notes || undefined,
    createdAt: r.created_at,
  }));
}
