import { Router } from 'express';
import { activityRouter } from './activity.js';
import { documentsRouter } from './documents.js';
import { feedbackRouter } from './feedback.js';
import { pasteRouter } from './paste.js';
import { settingsRouter } from './settings.js';
import { sourcesRouter } from './sources.js';
import { uploadsRouter } from './uploads.js';

const router = Router();

router.use('/paste', pasteRouter);
router.use('/documents', documentsRouter);
router.use('/sources', sourcesRouter);
router.use('/uploads', uploadsRouter);
router.use('/feedback', feedbackRouter);
router.use('/activity', activityRouter);
router.use('/settings', settingsRouter);

export { router as adminRouter };
