import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { fetchSettingsDirect, updateSettingsDirect } from '../mysql/personnelService';

export const settingsRouter = Router();

// GET /api/settings — PUBLIC. The sign-in screen reads company branding
// pre-auth (the app constructor fetches settings before login under
// per-feature loading). This is the same exposure GET /api/sync's
// unauthenticated tier already has (settings-only) — no new surface.
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await fetchSettingsDirect();
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Everything below on this router is authenticated.
settingsRouter.use(authenticateToken);

// PUT /api/settings
// DONE-BY AUDIT (2026-11-21): the acting user comes from the verified session.
settingsRouter.put('/', requirePermission('manage_settings'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await updateSettingsDirect(req.body, req.user?.id);
    res.json({ success: true, message: 'Settings updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
