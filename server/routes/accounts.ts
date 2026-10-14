import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, requireEitherPermission } from '../middleware/auth';
import {
  fetchAccountsDirect,
  fetchAccountByIdDirect,
  fetchTransfersDirect,
  fetchAdjustmentsDirect,
} from '../mysql/financeService';

export const accountsRouter = Router();
export const transfersRouter = Router();
export const adjustmentsRouter = Router();

accountsRouter.use(authenticateToken);
transfersRouter.use(authenticateToken);
adjustmentsRouter.use(authenticateToken);

// ==========================================
// CASH & BANK ACCOUNTS
// ==========================================

// GET /api/accounts
accountsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await fetchAccountsDirect();
    res.json({ success: true, count: accounts.length, data: accounts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/accounts/:id
accountsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await fetchAccountByIdDirect(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, data: account });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/accounts
accountsRouter.post('/', requireEitherPermission('manage_cash_bank', 'record_payments'), async (req: Request, res: Response) => {
  try {
    const { name, type, openingBalance, asOfDate, accountNumber, ifscCode, bankName, notes, isDefault } = req.body;
    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'Name and Type are required' });
    }

    const newAccount = await serverDb.addAccountAsync({
      name,
      type,
      openingBalance: Number(openingBalance) || 0,
      asOfDate: asOfDate || new Date().toISOString().split('T')[0],
      accountNumber,
      ifscCode,
      bankName,
      notes,
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    res.status(201).json({ success: true, message: 'Account created successfully', data: newAccount });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/accounts/:id
accountsRouter.put('/:id', requireEitherPermission('manage_cash_bank', 'record_payments'), async (req: Request, res: Response) => {
  try {
    const updated = await serverDb.updateAccountAsync(req.params.id, req.body);
    res.json({ success: true, message: 'Account updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/accounts/:id
accountsRouter.delete('/:id', requirePermission('manage_cash_bank'), async (req: Request, res: Response) => {
  try {
    const success = await serverDb.deleteAccountAsync(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/accounts/:id/recalculate
accountsRouter.post('/:id/recalculate', async (req: Request, res: Response) => {
  try {
    serverDb.recalculateAccountBalance(req.params.id);
    const updated = serverDb.getAccountById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// INTERNAL TRANSFERS
// ==========================================

// GET /api/transfers
transfersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const transfers = await fetchTransfersDirect();
    res.json({ success: true, count: transfers.length, data: transfers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/transfers
transfersRouter.post('/', requireEitherPermission('record_payments', 'manage_cash_bank'), async (req: Request, res: Response) => {
  try {
    const { date, fromAccountId, fromAccountName, toAccountId, toAccountName, transferType, amount, referenceNumber, notes } = req.body;
    if (!fromAccountId || !toAccountId || !amount) {
      return res.status(400).json({ success: false, error: 'Source account, destination account, and amount are required' });
    }

    if (fromAccountId === toAccountId) {
      return res.status(400).json({ success: false, error: 'Source and destination accounts must be different' });
    }

    const newTransfer = await serverDb.addTransferAsync({
      date: date || new Date().toISOString().split('T')[0],
      fromAccountId,
      fromAccountName: fromAccountName || 'Source Account',
      toAccountId,
      toAccountName: toAccountName || 'Destination Account',
      transferType: transferType || 'bank_to_bank',
      amount: Number(amount) || 0,
      referenceNumber,
      notes,
    });

    res.status(201).json({ success: true, message: 'Transfer recorded successfully', data: newTransfer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/transfers/:id
transfersRouter.delete('/:id', requirePermission('manage_cash_bank'), async (req: Request, res: Response) => {
  try {
    const success = await serverDb.deleteTransferAsync(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Transfer not found' });
    }
    res.json({ success: true, message: 'Transfer deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ACCOUNT ADJUSTMENTS
// ==========================================

// GET /api/adjustments
adjustmentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const adjustments = await fetchAdjustmentsDirect();
    res.json({ success: true, count: adjustments.length, data: adjustments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/adjustments
adjustmentsRouter.post('/', requirePermission('manage_cash_bank'), async (req: Request, res: Response) => {
  try {
    const { accountId, accountName, accountType, date, type, amount, reason, referenceNumber, notes } = req.body;
    if (!accountId || !amount || !type || !reason) {
      return res.status(400).json({ success: false, error: 'Account, amount, adjustment type, and reason are required' });
    }

    const newAdjustment = await serverDb.addAdjustmentAsync({
      accountId,
      accountName: accountName || 'Account',
      accountType: accountType || 'bank',
      date: date || new Date().toISOString().split('T')[0],
      type,
      amount: Number(amount) || 0,
      reason,
      referenceNumber,
      notes,
    });

    res.status(201).json({ success: true, message: 'Adjustment recorded successfully', data: newAdjustment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/adjustments/:id
adjustmentsRouter.delete('/:id', requirePermission('manage_cash_bank'), async (req: Request, res: Response) => {
  try {
    const success = await serverDb.deleteAdjustmentAsync(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Adjustment not found' });
    }
    res.json({ success: true, message: 'Adjustment deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
