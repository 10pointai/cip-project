import { Router, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission, requireEitherPermission, AuthenticatedRequest } from '../middleware/auth';
import { generatePresignedDownloadUrl } from '../services/storage';

export const documentsRouter = Router();

// Every document endpoint is authenticated; record creation is open to any
// signed-in operator (uploads originate from many features) while reads and
// order-linking are gated per feature below.
documentsRouter.use(authenticateToken);

/**
 * POST /api/documents — persist an S3 upload record.
 * The client has ALREADY stream-uploaded the file to AWS S3 through the
 * presigned-URL endpoint (s3Upload.ts); this only registers the record that
 * features will map their orders to. uploaded_by_id is taken from the JWT —
 * the client never supplies it (FK-only trust).
 * body: { fileName, documentName (user-entered, REQUIRED), s3Key, url, contentType?, sizeBytes? }
 */
documentsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileName, name, documentName, s3Key, url, contentType, sizeBytes } = req.body || {};
    if (!fileName && !name) {
      return res.status(400).json({ success: false, error: 'fileName is required.' });
    }
    // USER RULE: the document name is taken from the uploader in the input
    // shown against each upload — a record cannot be registered without one.
    if (!documentName || !String(documentName).trim()) {
      return res.status(400).json({ success: false, error: 'Document name is required — name the document in the upload row before saving.' });
    }
    if (!s3Key || !url) {
      return res.status(400).json({ success: false, error: 's3Key and url are required.' });
    }
    const doc = serverDb.createDocument(
      {
        fileName: String(fileName || name),
        documentName: String(documentName).trim().slice(0, 255),
        s3Key: String(s3Key),
        url: String(url),
        contentType: contentType ? String(contentType) : undefined,
        sizeBytes: sizeBytes ? Number(sizeBytes) : undefined,
      },
      req.user?.id
    );
    res.status(201).json({ success: true, data: doc, message: `Document "${doc.documentName || doc.fileName}" registered.` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/documents/sale/:saleId — documents attached to a sale
documentsRouter.get(
  '/sale/:saleId',
  requireEitherPermission('manage_sales', 'record_payments', 'dispatch_trips'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docs = serverDb.getDocumentsForSale(req.params.saleId);
      res.json({ success: true, count: docs.length, data: docs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/documents/purchase/:purchaseId — documents attached to a purchase
documentsRouter.get(
  '/purchase/:purchaseId',
  requireEitherPermission('manage_purchases', 'record_payments', 'dispatch_trips'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docs = serverDb.getDocumentsForPurchase(req.params.purchaseId);
      res.json({ success: true, count: docs.length, data: docs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/documents/sale/:saleId/link — map already-uploaded documents to a
 * sale. Used by create/edit/stage-issue flows (documentIds ride the order
 * payload server-side) AND by the detail-modal "upload more" uploader.
 * body: { documentIds: string[] }
 */
documentsRouter.post(
  '/sale/:saleId/link',
  requirePermission('manage_sales'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { documentIds } = req.body || {};
      const added = serverDb.linkSaleDocuments(req.params.saleId, Array.isArray(documentIds) ? documentIds : []);
      res.json({ success: true, added, message: `${added} document(s) linked to the sale.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/documents/purchase/:purchaseId/link
documentsRouter.post(
  '/purchase/:purchaseId/link',
  requirePermission('manage_purchases'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { documentIds } = req.body || {};
      const added = serverDb.linkPurchaseDocuments(req.params.purchaseId, Array.isArray(documentIds) ? documentIds : []);
      res.json({ success: true, added, message: `${added} document(s) linked to the purchase.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/documents/item/:itemId — documents attached to an inventory item
documentsRouter.get(
  '/item/:itemId',
  requirePermission('manage_inventory'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docs = serverDb.getDocumentsForItem(req.params.itemId);
      res.json({ success: true, count: docs.length, data: docs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/documents/party/:partyId — documents attached to a party (payment-
// recording operators read these from the party detail screen too)
documentsRouter.get(
  '/party/:partyId',
  requireEitherPermission('manage_parties', 'record_payments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docs = serverDb.getDocumentsForParty(req.params.partyId);
      res.json({ success: true, count: docs.length, data: docs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/documents/item/:itemId/link — map already-uploaded documents to an
// inventory item (used by the item create/edit form's staged uploads AND by
// the detail-modal "upload more" uploader)
documentsRouter.post(
  '/item/:itemId/link',
  requirePermission('manage_inventory'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { documentIds } = req.body || {};
      const added = serverDb.linkItemDocuments(req.params.itemId, Array.isArray(documentIds) ? documentIds : []);
      res.json({ success: true, added, message: `${added} document(s) linked to the item.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/documents/party/:partyId/link — map already-uploaded documents to
// a party (used by the party create/edit form's staged uploads AND by the
// party detail screen's "upload more" uploader)
documentsRouter.post(
  '/party/:partyId/link',
  requirePermission('manage_parties'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { documentIds } = req.body || {};
      const added = serverDb.linkPartyDocuments(req.params.partyId, Array.isArray(documentIds) ? documentIds : []);
      res.json({ success: true, added, message: `${added} document(s) linked to the party.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/documents/:id/download — view link, served via CloudFront ALWAYS
 * (user rule: every served URL is the CDN form; documents.url already carries
 * it). The S3 presigned GET remains only a fallback for the improbable case
 * of a row with no url at all.
 */
documentsRouter.get('/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = serverDb.getDocumentById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }
    if (doc.url) {
      return res.json({ success: true, data: { url: doc.url, expiresIn: 0, servedBy: 'cloudfront' } });
    }
    const url = await generatePresignedDownloadUrl(doc.s3Key);
    res.json({ success: true, data: { url: url || doc.url, expiresIn: 3600, servedBy: 's3-presigned-fallback' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});