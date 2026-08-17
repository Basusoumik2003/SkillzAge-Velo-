const { body } = require('express-validator');

const signupValidators = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Full name must be between 2 and 150 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),

  body('gender')
    .trim()
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be one of: male, female, other'),

  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  body('confirmPassword')
    .notEmpty()
    .withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Confirm password does not match password');
      }
      return true;
    }),
];

const loginValidators = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/*
 * Wix → Backend sync
 */
const wixSyncValidators = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),

  body('memberId')
    .trim()
    .notEmpty()
    .withMessage('Wix member ID is required'),
];

module.exports = {
  signupValidators,
  loginValidators,
  wixSyncValidators,
};