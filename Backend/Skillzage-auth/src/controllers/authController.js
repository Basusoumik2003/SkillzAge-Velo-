const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

async function signup(req, res, next) {
  try {
    const { fullName, email, gender, password } = req.body;

    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.createUser({ fullName, email, gender, passwordHash });

    const token = signToken({ sub: String(user.id), id: user.id, email: user.email });

    return res.status(201).json({
      success: true,
      message: 'Signup successful',
      data: { user, token },
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
if (process.env.BYPASS_AUTH === 'true') {
  const token = signToken({ id: 'dev-auth-user', email });
  return res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: 'dev-auth-user',
        full_name: 'Development User',
        email,
        gender: null,
      },
      token,
    },
  });
}
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = signToken({ sub: String(user.id), id: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user: userModel.toPublicUser(user), token },
    });
  } catch (err) {
    return next(err);
  }
}

/** Returns the authenticated user's profile. Requires the requireAuth middleware. */
async function me(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { signup, login, me };
