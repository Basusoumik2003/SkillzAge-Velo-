const userModel = require('../models/userModel');
const profileModel = require('../models/profileModel');

async function getProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const profile = await profileModel.findByUserId(userId);

    return res.status(200).json({
      success: true,
      data: {
        user,
        profile,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const profile = await profileModel.upsertProfile(userId, req.body || {});

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        profile,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const profile = await profileModel.deleteProfile(userId);

    return res.status(200).json({
      success: true,
      message: 'Profile deleted successfully',
      data: {
        profile,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  deleteProfile,
};
