import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import {
  fetchSalesDirect,
  fetchSaleByIdDirect,
  createSaleDirect,
  updateSaleDirect,
  addSaleStageDirect,
  deleteSaleDirect,
} from '../mysql/operationsService';

export const salesRouter = Router();

salesRouter.use(authenticateToken);

// Stage-ladder business-rule errors (locked / invalid transition / missing
// settlement account for a "Settle Payment Now" save) are 400
const bizStatus = (msg: string) =>
  /locked|cannot|cancelled|settlement account is required|disbursement/i.test(msg || '') ? 400 : 500;

// GET /api/sales
salesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const sales = await fetchSalesDirect();
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sales/:id
salesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const sale = await fetchSaleByIdDirect(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sales — create master + first stage
salesRouter.post('/', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.partyId || !Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ success: false, error: 'partyId and items are required' });
    }
    if (data.stage?.updateInventory && !data.stage.stageNumber && !data.saleNumber) {
      return res.status(400).json({ success: false, error: 'stageNumber or saleNumber is required to update inventory' });
    }
    const sale = await createSaleDirect(data);
    res.status(201).json({ success: true, message: 'Sale created successfully', data: sale });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// PUT /api/sales/:id — master-level updates (items replacement included)
salesRouter.put('/:id', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const updated = await updateSaleDirect(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, message: 'Sale updated successfully', data: updated });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// POST /api/sales/:id/stages — issue the next stage document per the sale ladder
salesRouter.post('/:id/stages', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const stageInput = req.body;
    if (!stageInput.stageType) {
      return res.status(400).json({ success: false, error: 'stageType is required' });
    }
    if (stageInput.updateInventory && !stageInput.stageNumber) {
      return res.status(400).json({ success: false, error: 'stageNumber is required to update inventory' });
    }
    const sale = await addSaleStageDirect(req.params.id, stageInput);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.status(201).json({ success: true, message: 'Sale stage saved successfully', data: sale });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});

// DELETE /api/sales/:id
salesRouter.delete('/:id', requirePermission('manage_sales'), async (req: Request, res: Response) => {
  try {
    const success = await deleteSaleDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    res.json({ success: true, message: 'Sale deleted successfully' });
  } catch (error: any) {
    res.status(bizStatus(error.message)).json({ success: false, error: error.message });
  }
});