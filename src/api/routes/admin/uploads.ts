import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { DocumentService } from '../../../domain/knowledge/documentService.js';
import { SourceModel } from '../../../infra/mongo/models/Source.js';
import { getStorage } from '../../../infra/storage/index.js';
import { getJobQueue } from '../../../jobs/index.js';
import { tenantMiddleware } from '../../middleware/tenant.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/xhtml+xml',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

router.post(
  '/',
  tenantMiddleware,
  (req: Request, res: Response, next: NextFunction): void => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `File exceeds 50 MB limit` });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const tenantId = req.tenantId!.toString();
    const userId = req.user!._id.toString();

    const visibilityRaw = req.body.visibility ?? 'draft';
    const visibility =
      visibilityRaw === 'customer-facing' || visibilityRaw === 'internal' || visibilityRaw === 'draft'
        ? (visibilityRaw as 'customer-facing' | 'internal' | 'draft')
        : 'draft';

    const tagsRaw: string = req.body.tags ?? '';
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    try {
      const source = await SourceModel.findOneAndUpdate(
        {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          type: 'upload',
          subtype: 'file',
        },
        {
          $setOnInsert: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            type: 'upload',
            subtype: 'file',
            config: { name: 'upload-default' },
            status: 'active',
            addedBy: new mongoose.Types.ObjectId(userId),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );

      const fileKey = `${crypto.randomUUID()}/${req.file.originalname}`;
      const storage = getStorage();
      await storage.put(tenantId, fileKey, req.file.buffer, req.file.mimetype);

      const documentService = new DocumentService(getJobQueue());
      const doc = await documentService.add({
        tenantId,
        sourceId: source!._id.toString(),
        sourceType: 'upload',
        title: req.file.originalname,
        fileKey,
        fileMimeType: req.file.mimetype,
        visibility,
        addedBy: userId,
        tags,
      });

      res.status(201).json({ documentId: doc._id.toString(), status: doc.status });
    } catch (err) {
      next(err);
    }
  },
);

export { router as uploadsRouter };
