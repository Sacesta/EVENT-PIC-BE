const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const emailService = require('../services/emailService');

const router = express.Router();

// Validation schema for producer registration
const producerRegistrationSchema = Joi.object({
  // User Details
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().optional(),
  description: Joi.string().max(1000).optional(),
  
  // Producer Details
  producerDetails: Joi.object({
    companyName: Joi.string().min(2).max(200).optional(),
    businessLicense: Joi.string().optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
    specializations: Joi.array().items(Joi.string()).optional(),
    website: Joi.string().uri().optional(),
    portfolio: Joi.array().items(Joi.string().uri()).optional()
  }).optional(),
  
  // Terms and Privacy Agreement
  agreeToTerms: Joi.boolean().valid(true).required().messages({
    'any.only': 'You must agree to the terms and privacy policy'
  }),
  
  // Optional fields
  language: Joi.string().valid('he', 'en', 'ar').default('he'),
  profileImage: Joi.string().optional()
});

// @desc    Register producer
// @route   POST /api/producer-registration/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    // Validate input
    console.log("errro : ", req.body);
    const { error, value } = producerRegistrationSchema.validate(req.body);


    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { 
      name, 
      email, 
      password, 
      phone,
      description,
      producerDetails,
      agreeToTerms,
      language,
      profileImage
    } = value;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create producer user with verified status
    const producer = await User.create({
      name,
      email,
      password,
      phone,
      role: 'producer',
      language: language || 'he',
      profileImage,
      producerDetails: {
        companyName: producerDetails.companyName,
        businessLicense: producerDetails.businessLicense,
        experience: producerDetails.experience || 'intermediate',
        specializations: producerDetails.specializations || [],
        website: producerDetails.website,
        portfolio: producerDetails.portfolio || []
      },
      // Producers don't need admin approval - they can start using the platform immediately
      verificationStatus: 'approved',
      isVerified: true, // Auto-verify at registration
      isActive: true
    });

    // Send welcome email directly (skip verification step)
    try {
      await emailService.sendWelcomeEmail(producer);
      console.log('✅ Welcome email sent to producer');
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      // Don't fail registration if email fails, but log the error
    }

    // Log successful registration
    console.log(`New producer registration: ${producer.name} (${producer.email}) - Company: ${producerDetails.companyName}`);

    res.status(201).json({
      success: true,
      message: 'Producer registered successfully! Welcome to PIC!',
      data: {
        producer: {
          id: producer._id,
          name: producer.name,
          email: producer.email,
          phone: producer.phone,
          role: producer.role,
          companyName: producer.producerDetails.companyName,
          verificationStatus: producer.verificationStatus,
          isVerified: producer.isVerified,
          registrationDate: producer.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Producer registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @desc    Get producer registration status
// @route   GET /api/producer-registration/status/:email
// @access  Public
router.get('/status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const producer = await User.findOne({ 
      email, 
      role: 'producer' 
    }).populate('events', 'name startDate status');

    if (!producer) {
      return res.status(404).json({
        success: false,
        message: 'Producer not found'
      });
    }

    res.json({
      success: true,
      data: {
        name: producer.name,
        email: producer.email,
        phone: producer.phone,
        companyName: producer.producerDetails?.companyName,
        verificationStatus: producer.verificationStatus,
        isVerified: producer.isVerified,
        isActive: producer.isActive,
        eventsCount: producer.events?.length || 0,
        registrationDate: producer.createdAt
      }
    });

  } catch (error) {
    console.error('Get producer registration status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching registration status'
    });
  }
});

// @desc    Validate producer registration data (for frontend validation)
// @route   POST /api/producer-registration/validate
// @access  Public
router.post('/validate', async (req, res) => {
  try {
    // Validate input
    const { error, value } = producerRegistrationSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: value.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{
          field: 'email',
          message: 'Email already exists'
        }]
      });
    }

    res.json({
      success: true,
      message: 'Validation passed',
      data: {
        valid: true
      }
    });

  } catch (error) {
    console.error('Producer validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation'
    });
  }
});

// @desc    Get producer specializations options
// @route   GET /api/producer-registration/specializations
// @access  Public
router.get('/specializations', async (req, res) => {
  try {
    const specializations = [
      'Corporate Events',
      'Weddings',
      'Birthday Parties',
      'Conferences',
      'Trade Shows',
      'Product Launches',
      'Charity Events',
      'Cultural Events',
      'Sports Events',
      'Music Concerts',
      'Art Exhibitions',
      'Fashion Shows',
      'Food Festivals',
      'Holiday Celebrations',
      'Networking Events',
      'Award Ceremonies',
      'Graduation Ceremonies',
      'Religious Ceremonies',
      'Community Events',
      'Private Parties'
    ];

    res.json({
      success: true,
      data: specializations
    });
  } catch (error) {
    console.error('Get specializations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching specializations'
    });
  }
});

module.exports = router;
