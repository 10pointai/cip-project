import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { writeProductionBatchACID } from '../mysql/azureTransactions';
import { fetchBatchesDirect } from '../mysql/operationsService';

export const productionRouter = Router();

productionRouter.use(authenticateToken);

// GET /api/batches
productionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const batches = await fetchBatchesDirect();
    res.json({ success: true, count: batches.length, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/batches - ACID Multi-Table Batch Production & Stock Deduction
productionRouter.post('/', requirePermission('manage_production'), async (req: Request, res: Response) => {
  try {
    const { batchNumber, targetItemId, targetQuantity, rawMaterialsConsumed } = req.body;
    if (!batchNumber || !targetItemId || !targetQuantity || !rawMaterialsConsumed) {
      return res.status(400).json({ success: false, error: 'batchNumber, targetItemId, targetQuantity, and rawMaterialsConsumed are required' });
    }
    const result = await writeProductionBatchACID(req.body);
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

// DELETE /api/batches/:id
productionRouter.delete('/:id', requirePermission('manage_production'), (req: Request, res: Response) => {
  try {
    const success = serverDb.deleteProductionBatch(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    res.json({ success: true, message: 'Production batch deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
