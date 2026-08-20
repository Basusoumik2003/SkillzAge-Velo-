const express = require('express');
const requireAuth = require('../middlewares/authMiddleware');
const profileController = require('../controllers/profileController');

const router = express.Router();

router.get('/', requireAuth, profileController.getProfile);
router.put('/', requireAuth, profileController.updateProfile);
router.delete('/', requireAuth, profileController.deleteProfile);

module.exports = router;
