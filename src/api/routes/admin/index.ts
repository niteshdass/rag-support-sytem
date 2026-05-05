import { Router } from 'express';
import { documentsRouter } from './documents.js';
import { pasteRouter } from './paste.js';
import { sourcesRouter } from './sources.js';
import { uploadsRouter } from './uploads.js';

const router = Router();

router.use('/paste', pasteRouter);
router.use('/documents', documentsRouter);
router.use('/sources', sourcesRouter);
router.use('/uploads', uploadsRouter);

export { router as adminRouter };
