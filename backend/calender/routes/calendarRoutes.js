const express = require('express');
const router = express.Router();
const calendarController = require('../controller/calendarController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/config', calendarController.getConfig);

// OAuth routes removed
router.get('/events', calendarController.getEventsInRange);
// upsert MUST be before the generic POST /events and before /:id routes
router.post('/events/upsert', calendarController.upsertBySourceKey);
router.post('/events', calendarController.createEvent);
router.put('/events/:id', calendarController.updateEvent);
router.delete('/events/:id', calendarController.deleteEvent);

router.get('/sync_logs', calendarController.getSyncLogs);
router.post('/sync_logs', calendarController.appendSyncLog);

module.exports = router;
