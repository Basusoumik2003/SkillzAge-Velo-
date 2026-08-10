const express = require('express');
const authController = require('../controllers/authController');
const requireAuth = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { signupValidators, loginValidators } = require('../utils/validators');

const router = express.Router();

router.post('/signup', signupValidators, validateRequest, authController.signup);
router.post('/login', loginValidators, validateRequest, authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
