const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Service = require('../models/Service');
const emailService = require('../services/emailService');

const router = express.Router();

// Validation schema for supplier registration - updated to match frontend format
const supplierRegistrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  description: Joi.string().allow("",null).max(500).optional(),
  phone: Joi.string().optional(),
  
  // Accept both formats: services array (from frontend) or serviceCategories (legacy)
  services: Joi.array().items(
    Joi.object({
      category: Joi.string().valid(
        'photography', 'videography', 'catering', 'music', 
        'decoration', 'transportation', 'security', 'lighting',
        'sound', 'furniture', 'tents', 'other'
      ).required()
    })
  ).min(1).optional(),
  
  serviceCategories: Joi.array().items(
    Joi.string().valid(
      'photography', 'videography', 'catering', 'music', 
      'decoration', 'transportation', 'security', 'lighting',
      'sound', 'furniture', 'tents', 'other'
    )
  ).min(1).optional(),

  location: Joi.object({
    city: Joi.string().required(),
    country: Joi.string().allow("",null).optional()
  }).required(),

  yearsOfExperience: Joi.number().min(0).max(50).optional(),

  website: Joi.string().uri().allow('', null).optional(),
  portfolio: Joi.array().items(Joi.string().uri()).optional()
}).or('services', 'serviceCategories'); // At least one of these must be provided


// Available service categories (matching Service model enum values)
const serviceCategories = {
  photography: {
    name: { en: 'Photography', he: 'צילום' },
    description: { 
      en: 'Event photography, portraits, commercial photography', 
      he: 'צילום אירועים, פורטרטים, צילום מסחרי' 
    }
  },
  videography: {
    name: { en: 'Videography', he: 'וידאו' },
    description: { 
      en: 'Event videography, promotional videos, documentaries', 
      he: 'צילום וידאו לאירועים, סרטוני תדמית, דוקומנטרי' 
    }
  },
  catering: {
    name: { en: 'Catering', he: 'קייטרינג' },
    description: { 
      en: 'Event catering, meal planning, food services', 
      he: 'קייטרינג לאירועים, תכנון ארוחות, שירותי מזון' 
    }
  },
  music: {
    name: { en: 'Music', he: 'מוזיקה' },
    description: { 
      en: 'DJ services, live music, sound equipment rental', 
      he: 'שירותי די-ג׳יי, מוזיקה חיה, השכרת ציוד סאונד' 
    }
  },
  decoration: {
    name: { en: 'Decoration', he: 'עיצוב' },
    description: { 
      en: 'Event decoration, floral arrangements, theme setup', 
      he: 'עיצוב אירועים, סידורי פרחים, עיצוב נושא' 
    }
  },
  transportation: {
    name: { en: 'Transportation', he: 'תחבורה' },
    description: { 
      en: 'Event transportation, logistics, vehicle rental', 
      he: 'תחבורה לאירועים, לוגיסטיקה, השכרת רכבים' 
    }
  },
  security: {
    name: { en: 'Security', he: 'אבטחה' },
    description: { 
      en: 'Event security, crowd control, safety services', 
      he: 'אבטחת אירועים, שליטה בקהל, שירותי בטיחות' 
    }
  },
  lighting: {
    name: { en: 'Lighting', he: 'תאורה' },
    description: { 
      en: 'Event lighting, stage lighting, ambient lighting', 
      he: 'תאורת אירועים, תאורת במה, תאורה סביבתית' 
    }
  },
  sound: {
    name: { en: 'Sound', he: 'סאונד' },
    description: { 
      en: 'Sound systems, audio equipment, microphones', 
      he: 'מערכות סאונד, ציוד שמע, מיקרופונים' 
    }
  },
  furniture: {
    name: { en: 'Furniture', he: 'רהיטים' },
    description: { 
      en: 'Event furniture, seating, tables, decor furniture', 
      he: 'רהיטים לאירועים, מקומות ישיבה, שולחנות, ריהוט דקורטיבי' 
    }
  },
  tents: {
    name: { en: 'Tents', he: 'אוהלים' },
    description: { 
      en: 'Event tents, canopies, outdoor structures', 
      he: 'אוהלים לאירועים, סככות, מבנים חיצוניים' 
    }
  },
  other: {
    name: { en: 'Other Services', he: 'שירותים אחרים' },
    description: { 
      en: 'Specialized services not listed above', 
      he: 'שירותים מיוחדים שאינם מופיעים ברשימה' 
    }
  }
};


// @desc    Get available service categories (without predefined packages)
// @route   GET /api/supplier-registration/service-categories
// @access  Public
router.get('/service-categories', async (req, res) => {
  try {
    res.json({
      success: true,
      data: serviceCategories
    });
  } catch (error) {
    console.error('Get service categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service categories'
    });
  }
});

// @desc    Register supplier with service categories only
// @route   POST /api/supplier-registration/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = supplierRegistrationSchema.validate(req.body);

    console.log("request body",req.body);
    console.log("validation ->",error);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
        errors: error.details.map(detail => detail.message)
      });
    }
    
    const { 
      name, 
      email, 
      password, 
      description, 
      services,
      serviceCategories, 
      location, 
      yearsOfExperience,
      phone,
      website,
      portfolio
    } = value;

    // Transform services array to serviceCategories if needed
    let finalServiceCategories;
    if (services && services.length > 0) {
      // Frontend format: [{category: "videography"}, {category: "music"}]
      finalServiceCategories = services.map(service => service.category);
    } else if (serviceCategories && serviceCategories.length > 0) {
      // Legacy format: ["videography", "music"]
      finalServiceCategories = serviceCategories;
    } else {
      return res.status(400).json({
        success: false,
        message: 'At least one service category must be provided'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create supplier user with selected service categories
    const supplier = await User.create({
      name,
      email,
      password,
      role: 'supplier',
      phone,
      verificationStatus: 'pending', // Requires admin approval
      supplierDetails: {
        companyName: name,
        experience: yearsOfExperience >= 5 ? 'expert' : yearsOfExperience >= 2 ? 'intermediate' : 'beginner',
        categories: finalServiceCategories, // Store selected service categories
        description,
        location: {
          city: location.city,
          country: location.country || ''
        },
        website,
        portfolio: portfolio || []
      }
    });

    // Generate email verification token
    const verificationToken = supplier.generateEmailVerificationToken();
    await supplier.save();

    // Send verification email
    try {
      await emailService.sendVerificationEmail(supplier, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Send notification to admin about new supplier registration
    try {
      console.log(`New supplier registration: ${supplier.name} (${supplier.email}) with categories: ${finalServiceCategories.join(', ')}`);
    } catch (notificationError) {
      console.error('Failed to send admin notification:', notificationError);
    }

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully. Once approved, you can create your services and packages in your dashboard.',
      data: {
        supplier: {
          id: supplier._id,
          name: supplier.name,
          email: supplier.email,
          verificationStatus: supplier.verificationStatus,
          serviceCategories: finalServiceCategories,
          categoriesCount: finalServiceCategories.length
        }
      }
    });

  } catch (error) {
    console.error('Supplier registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @desc    Get registration status
// @route   GET /api/supplier-registration/status/:email
// @access  Public
router.get('/status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const supplier = await User.findOne({ 
      email, 
      role: 'supplier' 
    }).populate('services', 'title category price status available');

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Get services count (may be 0 for newly registered suppliers)
    const servicesCount = supplier.services ? supplier.services.length : 0;
    const activeServicesCount = supplier.services ? 
      supplier.services.filter(service => service.status === 'active' && service.available).length : 0;

    res.json({
      success: true,
      data: {
        name: supplier.name,
        email: supplier.email,
        verificationStatus: supplier.verificationStatus,
        isVerified: supplier.isVerified,
        serviceCategories: supplier.supplierDetails?.categories || [],
        categoriesCount: supplier.supplierDetails?.categories?.length || 0,
        servicesCount: servicesCount,
        activeServicesCount: activeServicesCount,
        registrationDate: supplier.createdAt,
        canCreateServices: supplier.verificationStatus === 'approved' && supplier.isVerified
      }
    });

  } catch (error) {
    console.error('Get registration status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching registration status'
    });
  }
});

module.exports = router;
