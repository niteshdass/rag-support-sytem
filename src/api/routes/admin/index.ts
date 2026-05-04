import { Router } from 'express';
import { documentsRouter } from './documents.js';
import { pasteRouter } from './paste.js';
import { sourcesRouter } from './sources.js';

const router = Router();

router.use('/paste', pasteRouter);
router.use('/documents', documentsRouter);
router.use('/sources', sourcesRouter);

export { router as adminRouter };
