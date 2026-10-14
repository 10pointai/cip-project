import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requireEitherPermission } from '../middleware/auth';
import {
  fetchOrdersDirect,
  fetchOrderByIdDirect,
  createOrderDirect,
  updateOrderDirect,
  deleteOrderDirect,
} from '../mysql/operationsService';

export const ordersRouter = Router();

ordersRouter.use(authenticateToken);

// GET /api/orders
ordersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const orders = await fetchOrdersDirect();
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/orders/:id
ordersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await fetchOrderByIdDirect(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/orders
ordersRouter.post('/', requireEitherPermission('manage_sales', 'manage_purchases'), async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    if (!orderData.orderNumber || (!orderData.partyId && orderData.purchaseStage !== 'rfq') || !orderData.items) {
      return res.status(400).json({ success: false, error: 'orderNumber, partyId, and items are required' });
    }
    if (!orderData.partyId && orderData.purchaseStage === 'rfq') {
      orderData.partyId = 'unassigned';
      orderData.partyName = orderData.partyName || 'Unassigned (RFQ)';
    }
    const newOrder = await createOrderDirect(orderData);
    res.status(201).json({ success: true, message: 'Order created successfully', data: newOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/orders/:id
ordersRouter.put('/:id', requireEitherPermission('manage_sales', 'manage_purchases'), async (req: Request, res: Response) => {
  try {
    const updated = await updateOrderDirect(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/orders/:id
ordersRouter.delete('/:id', requireEitherPermission('manage_sales', 'manage_purchases'), async (req: Request, res: Response) => {
  try {
    const success = await deleteOrderDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
