import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import {
  fetchPurchasesDirect,
  fetchPurchaseByIdDirect,
  createPurchaseDirect,
  updatePurchaseDirect,
  addPurchaseStageDirect,
  deletePurchaseDirect,
} from '../mysql/operationsService';

export const purchasesRouter = Router();

purchasesRouter.use(authenticateToken);

// GET /api/purchases
// Stage/cash business-rule errors are 400 (locked ladder, missing settlement
// account for a "Settle Payment Now" save, goods receipt without a vendor)
const bizStatus = (msg: string) =>
  /locked|cannot|cancelled|settlement account is required|disbursement|supplier \/ vendor is required/i.test(msg || '') ? 400 : 500;

purchasesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const purchases = await fetchPurchasesDirect();
    res.json({ success: true, count: purchases.length, data: purchases });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// GET /api/purchases/:id
purchasesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const purchase = await fetchPurchaseByIdDirect(req.params.id);
    if (!purchase) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }
    res.json({ success: true, data: purchase });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/purchases — create master + first stage (RFQ ingestion may have no vendor yet)
purchasesRouter.post('/', requirePermission('manage_purchases'), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required' });
    }
    const purchase = await createPurchaseDirect(data);
    res.status(201).json({ success: true, message: 'Purchase created successfully', data: purchase });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// PUT /api/purchases/:id — master-level updates (items replacement included)
purchasesRouter.put('/:id', requirePermission('manage_purchases'), async (req: Request, res: Response) => {
  try {
    const updated = await updatePurchaseDirect(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }
    res.json({ success: true, message: 'Purchase updated successfully', data: updated });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/purchases/:id/stages — save a stage document (RFQ → PO → GRN);
// goods-receipt saves may carry the received quantities in `items`.
purchasesRouter.post('/:id/stages', requirePermission('manage_purchases'), async (req: Request, res: Response) => {
  try {
    const stageInput = req.body;
    if (!stageInput.stageType) {
      return res.status(400).json({ success: false, error: 'stageType is required' });
    }
    const purchase = await addPurchaseStageDirect(req.params.id, stageInput);
    if (!purchase) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }
    res.status(201).json({ success: true, message: 'Purchase stage saved successfully', data: purchase });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// DELETE /api/purchases/:id
purchasesRouter.delete('/:id', requirePermission('manage_purchases'), async (req: Request, res: Response) => {
  try {
    const success = await deletePurchaseDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }
    res.json({ success: true, message: 'Purchase deleted successfully' });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});