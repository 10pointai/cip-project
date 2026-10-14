import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';
import {
  fetchPartiesDirect,
  fetchPartyByIdDirect,
  createPartyDirect,
  updatePartyDirect,
  deletePartyDirect,
  fetchTransactionsDirect,
} from '../mysql/financeService';

export const partiesRouter = Router();

partiesRouter.use(authenticateToken);

// GET /api/parties
partiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { type, category, q } = req.query;
    const parties = await fetchPartiesDirect({
      type: typeof type === 'string' ? type : undefined,
      category: typeof category === 'string' ? category : undefined,
      query: typeof q === 'string' ? q : undefined,
    });
    res.json({ success: true, count: parties.length, data: parties });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/parties/:id
partiesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const party = await fetchPartyByIdDirect(req.params.id);
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }
    const transactions = await fetchTransactionsDirect({ partyId: party.id });
    res.json({ success: true, data: { ...party, transactions } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/parties
partiesRouter.post('/', requirePermission('manage_parties'), async (req: Request, res: Response) => {
  try {
    const partyData = req.body;
    if (!partyData.name || !partyData.type || !partyData.category) {
      return res.status(400).json({ success: false, error: 'Name, Type, and Category are required' });
    }
    const newParty = await createPartyDirect(partyData);
    res.status(201).json({ success: true, message: 'Party created successfully', data: newParty });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/parties/bulk
partiesRouter.post('/bulk', requirePermission('manage_parties'), async (req: Request, res: Response) => {
  try {
    const { parties } = req.body;
    if (!Array.isArray(parties) || parties.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of parties is required' });
    }

    // Validate required fields
    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      if (!p.name || !p.type) {
        return res.status(400).json({
          success: false,
          error: `Row ${i + 1}: Party Name and Type are required`,
        });
      }
    }

    const createdParties: any[] = [];
    for (const p of parties) {
      const created = await createPartyDirect(p);
      createdParties.push(created);
    }

    res.status(201).json({
      success: true,
      count: createdParties.length,
      message: `Successfully created ${createdParties.length} parties`,
      data: createdParties,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/parties/:id
partiesRouter.put('/:id', requirePermission('manage_parties'), async (req: Request, res: Response) => {
  try {
    const updated = await updatePartyDirect(req.params.id, req.body);
    res.json({ success: true, message: 'Party updated successfully', data: updated });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, error: error.message });
  }
});

// DELETE /api/parties/:id
partiesRouter.delete('/:id', requirePermission('manage_parties'), async (req: Request, res: Response) => {
  try {
    const success = await deletePartyDirect(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }
    res.json({ success: true, message: 'Party deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/parties/:id/statement
partiesRouter.get('/:id/statement', async (req: Request, res: Response) => {
  try {
    const party = await fetchPartyByIdDirect(req.params.id);
    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }
    const transactions = await fetchTransactionsDirect({ partyId: party.id });
    res.json({
      success: true,
      data: {
        party,
        transactions,
        openingBalance: party.openingBalance,
        openingBalanceType: party.openingBalanceType,
        currentBalance: party.currentBalance,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
