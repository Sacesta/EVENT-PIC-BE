const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// JWT token generation
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  
  const token = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  
  return token;
};

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('producer', 'supplier').required(),
  language: Joi.string().valid('he', 'en', 'ar').default('he'),
  phone: Joi.string().allow("",null).optional(),
  

  producerDetails: Joi.object({
    description: Joi.string().allow("",null).optional(),
    companyName: Joi.string().allow("",null).optional(),
    businessLicense: Joi.string().allow("",null).optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
    specializations: Joi.array().items(Joi.string()).optional()
  }).optional(),
  supplierDetails: Joi.object({
    companyName: Joi.string().optional(),
    businessLicense: Joi.string().optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional()
  }).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().optional(),
  language: Joi.string().valid('he', 'en', 'ar').optional(),
  profileImage: Joi.string().optional(),
  producerDetails: Joi.object({
    companyName: Joi.string().optional(),
    businessLicense: Joi.string().optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
    specializations: Joi.array().items(Joi.string()).optional()
  }).optional(),
  supplierDetails: Joi.object({
    companyName: Joi.string().optional(),
    businessLicense: Joi.string().optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional()
  }).optional()
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);

    console.log(req.body); console.log("errro : ", error);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { email, password, role, ...userData } = value;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user with verified status
    const user = await User.create({
      email,
      password,
      role,
      ...userData,
      isVerified: true // Auto-verify user at registration
    });

    // Send welcome email directly (skip verification step)
    try {
      await emailService.sendWelcomeEmail(user);
      console.log('✅ Welcome email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      // Don't fail registration if email fails, but log the error
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Welcome to PIC!',
      data: {
        user: user.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { email, password } = value;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email address. Please check your email or create a new account.',
        errorType: 'EMAIL_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support for assistance.',
        errorType: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Please try again or use the "Forgot Password" option.',
        errorType: 'INVALID_PASSWORD'
      });
    }

    // Check supplier verification status
    if (user.role === 'supplier') {
      if (user.verificationStatus === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your supplier account is pending admin approval. Please wait for verification before logging in.',
          errorType: 'SUPPLIER_PENDING_VERIFICATION'
        });
      }
      
      if (user.verificationStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          message: 'Your supplier account has been rejected. Please contact support for more information.',
          errorType: 'SUPPLIER_VERIFICATION_REJECTED'
        });
      }
      
      if (user.verificationStatus !== 'approved') {
        return res.status(403).json({
          success: false,
          message: 'Your supplier account requires admin approval before you can login.',
          errorType: 'SUPPLIER_NOT_APPROVED'
        });
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login. Please try again later.',
      errorType: 'SERVER_ERROR'
    });
  }
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    console.log("user : ",user);
    
    res.json({
      success: true,
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user fields
    Object.keys(value).forEach(key => {
      if (key === 'producerDetails' || key === 'supplierDetails') {
        user[key] = { ...user[key], ...value[key] };
      } else {
        user[key] = value[key];
      }
    });

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password'
    });
  }
});

// @desc    Upload verification documents (for suppliers)
// @route   POST /api/auth/upload-documents
// @access  Private (suppliers only)
router.post('/upload-documents', protect, authorize('supplier'), async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        message: 'Documents array is required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add new documents
    user.verificationDocuments.push(...documents);
    user.verificationStatus = 'pending';
    
    await user.save();

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: {
        verificationStatus: user.verificationStatus,
        documentsCount: user.verificationDocuments.length
      }
    });
  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading documents'
    });
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    // In a stateless JWT system, logout is handled client-side
    // You could implement a blacklist here if needed
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @desc    Verify email address
// @route   POST /api/auth/verify-email
// @access  Public
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Find user with verification token
    const user = await User.findOne({
      emailVerificationToken: require('crypto').createHash('sha256').update(token).digest('hex'),
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Verify the user
    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user);
      console.log('✅ Welcome email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      // Don't fail verification if welcome email fails
    }

    res.json({
      success: true,
      message: 'Email verified successfully. Welcome to Pic!',
      data: {
        user: user.getPublicProfile()
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during email verification'
    });
  }
});

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Private
router.post('/resend-verification', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    try {
      await emailService.sendVerificationEmail(user, verificationToken);
      console.log('✅ Verification email resent successfully');
      
      res.json({
        success: true,
        message: 'Verification email sent successfully'
      });
    } catch (emailError) {
      console.error('❌ Failed to resend verification email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resending verification email'
    });
  }
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate password reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
      console.log('✅ Password reset email sent successfully');
      
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      
      // Clear the reset token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      res.status(500).json({
        success: false,
        message: 'Failed to send password reset email'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Find user with reset token
    const user = await User.findOne({
      passwordResetToken: require('crypto').createHash('sha256').update(token).digest('hex'),
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Private
router.post('/refresh', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: user.getPublicProfile(),
        token
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while refreshing token'
    });
  }
});

module.exports = router; 