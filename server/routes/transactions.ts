import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requireEitherPermission, AuthenticatedRequest } from '../middleware/auth';
import { writeTransactionACID } from '../mysql/azureTransactions';
import { fetchTransactionsDirect, fetchTransactionByIdDirect, deleteTransactionDirect } from '../mysql/financeService';

export const transactionsRouter = Router();

transactionsRouter.use(authenticateToken);

// DONE-BY AUDIT (2026-11-21): the acting user comes from the verified
// session; the client body is never trusted for the actor stamp.
const actingUserId = (req: AuthenticatedRequest): string | undefined => req.user?.id;

// GET /api/transactions
transactionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { partyId, type, status } = req.query;
    const txns = await fetchTransactionsDirect({
      partyId: typeof partyId === 'string' ? partyId : undefined,
      type: typeof type === 'string' ? type : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json({ success: true, count: txns.length, data: txns });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/transactions/:id
transactionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const txn = await fetchTransactionByIdDirect(req.params.id);
    if (!txn) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    res.json({ success: true, data: txn });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/transactions - ACID Multi-Table Transaction
transactionsRouter.post('/', requireEitherPermission('record_payments', 'manage_sales', 'manage_purchases'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucherNumber, partyId, type, amount } = req.body;
    if (!voucherNumber || !partyId || !type || amount === undefined) {
      return res.status(400).json({ success: false, error: 'voucherNumber, partyId, type, and amount are required' });
    }
    const result = await writeTransactionACID(req.body, actingUserId(req));
    res.status(201).json({
      success: true,
      message: result.message,
      executedOnAzure: result.executedOnAzure,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/transactions/:id
transactionsRouter.put('/:id', requireEitherPermission('record_payments', 'manage_sales', 'manage_purchases'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = serverDb.updateTransaction(req.params.id, req.body, actingUserId(req));
    res.json({ success: true, message: 'Transaction updated successfully', data: updated });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, error: error.message });
  }
});

// DELETE /api/transactions/:id
transactionsRouter.delete('/:id', requireEitherPermission('record_payments', 'manage_sales', 'manage_purchases'), async (req: Request, res: Response) => {
  try {
    const success = await deleteTransactionDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    res.json({ success: true, message: 'Transaction deleted and balance recalculated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
