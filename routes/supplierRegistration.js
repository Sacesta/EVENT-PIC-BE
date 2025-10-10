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
        'photography', 'catering', 'bar', 'musicians',
        'scenery', 'sounds_lights', 'transportation', 'security',
        'first_aid', 'insurance', 'location', 'dj'
      ).required()
    })
  ).min(1).optional(),
  
  serviceCategories: Joi.array().items(
    Joi.string().valid(
      'photography', 'catering', 'bar', 'musicians',
      'scenery', 'sounds_lights', 'transportation', 'security',
      'first_aid', 'insurance', 'location', 'dj'
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
const SERVICE_CATEGORIES_INFO = {
  photography: {
    name: { en: 'Photography', he: 'צלמים' },
    description: { 
      en: 'Event photography, portraits, commercial photography', 
      he: 'צילום אירועים, פורטרטים, צילום מסחרי' 
    }
  },
  catering: {
    name: { en: 'Catering', he: 'קייטרינג' },
    description: { 
      en: 'Event catering, meal planning, food services', 
      he: 'קייטרינג לאירועים, תכנון ארוחות, שירותי מזון' 
    }
  },
  bar: {
    name: { en: 'Bar Services', he: 'בר' },
    description: { 
      en: 'Bartenders, cocktail service, bar setup for events', 
      he: 'ברמנים, שירות קוקטיילים, הקמת בר לאירועים' 
    }
  },
  musicians: {
    name: { en: 'Musicians', he: 'אומנים' },
    description: { 
      en: 'Live bands, singers, instrumentalists for events', 
      he: 'להקות חיות, זמרים, נגנים לאירועים' 
    }
  },
  scenery: {
    name: { en: 'Scenery', he: 'תפאורה' },
    description: { 
      en: 'Stage and scenery design for events and performances', 
      he: 'עיצוב במה ותפאורה לאירועים והופעות' 
    }
  },
  sounds_lights: {
    name: { en: 'Sounds & Lights', he: 'הגברה ותאורה' },
    description: { 
      en: 'Sound systems, lighting design, stage effects', 
      he: 'מערכות הגברה, תאורת במה, אפקטים לאירועים' 
    }
  },
  transportation: {
    name: { en: 'Transportation', he: 'שירותי הסעות' },
    description: { 
      en: 'Event transportation, logistics, vehicle rental', 
      he: 'הסעות לאירועים, לוגיסטיקה, השכרת רכבים' 
    }
  },
  security: {
    name: { en: 'Security', he: 'אבטחה' },
    description: { 
      en: 'Event security, crowd control, safety services', 
      he: 'אבטחת אירועים, שליטה בקהל, שירותי בטיחות' 
    }
  },
  first_aid: {
    name: { en: 'First Aid', he: 'עזרה ראשונה' },
    description: { 
      en: 'Medical staff and emergency first aid for events', 
      he: 'צוותים רפואיים ועזרה ראשונה לאירועים' 
    }
  },
  insurance: {
    name: { en: 'Insurance', he: 'ביטוח' },
    description: { 
      en: 'Event insurance and liability coverage services', 
      he: 'ביטוח אירועים ושירותי כיסוי אחריות' 
    }
  },
  location: {
    name: { en: 'Locations', he: 'מקומות להשכרה' },
    description: { 
      en: 'Venues, event spaces, and rental locations', 
      he: 'אולמות, מקומות פתוחים וחללים להשכרה לאירועים' 
    }
  },
  dj: {
    name: { en: 'DJ', he: 'די ג׳יי' },
    description: { 
      en: 'Professional DJ services for events and parties', 
      he: 'שירותי די ג׳יי מקצועיים לאירועים ומסיבות' 
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
      data: SERVICE_CATEGORIES_INFO
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

    // Generate email verification token first
    const verificationToken = supplier.generateEmailVerificationToken();

    // Create Service documents for each selected category
    const createdServices = [];
    console.log(`Creating services for categories: ${finalServiceCategories.join(', ')}`);
    
    for (const category of finalServiceCategories) {
      try {
        console.log(`Creating service for category: ${category}`);
        const categoryInfo = SERVICE_CATEGORIES_INFO[category];
        
        if (!categoryInfo) {
          console.error(`Category info not found for: ${category}`);
          continue;
        }
        
        const service = await Service.create({
          supplierId: supplier._id,
          title: `${categoryInfo.name.en} Services by ${name}`,
          description: (description && description.trim()) || categoryInfo.description.en,
          category: category,
          location: {
            city: location.city,
            serviceRadius: 50
          },
          experience: supplier.supplierDetails.experience,
          status: 'avtive', // Match supplier verification status
          available: false, // Not available until approved and details are filled
          portfolio: portfolio && portfolio.length > 0 ? portfolio.map(url => ({
            image: url,
            title: `Portfolio item`,
            eventType: category
          })) : []
        });
        
        console.log(`Service created successfully: ${service._id} for category: ${category}`);
        createdServices.push(service._id);
      } catch (serviceError) {
        console.error(`Error creating service for category ${category}:`, serviceError);
        console.error('Service error details:', serviceError.message);
        // Continue with other services even if one fails
      }
    }

    console.log(`Total services created: ${createdServices.length}`);

    // Link created services to the supplier and save everything at once
    if (createdServices.length > 0) {
      supplier.services = createdServices;
      console.log(`Linking ${createdServices.length} services to supplier ${supplier._id}`);
    }

    // Auto-verify supplier at registration and save
    supplier.isVerified = true;
    await supplier.save();
    console.log(`Supplier saved successfully with ${supplier.services.length} services`);

    // Send welcome email directly (skip verification step)
    try {
      await emailService.sendWelcomeEmail(supplier);
      console.log('✅ Welcome email sent to supplier');
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
    }

    // Send notification to admin about new supplier registration
    try {
      console.log(`New supplier registration: ${supplier.name} (${supplier.email}) with categories: ${finalServiceCategories.join(', ')}`);
    } catch (notificationError) {
      console.error('Failed to send admin notification:', notificationError);
    }

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully. Once approved, you can update your service details and packages in your dashboard.',
      data: {
        supplier: {
          id: supplier._id,
          name: supplier.name,
          email: supplier.email,
          verificationStatus: supplier.verificationStatus,
          serviceCategories: finalServiceCategories,
          categoriesCount: finalServiceCategories.length,
          servicesCreated: createdServices.length,
          serviceIds: createdServices
        }
      }
    });

  } catch (error) {
    console.error('Supplier registration error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors[0] || 'Validation error',
        errors: errors
      });
    }
    
    // Handle duplicate key errors (e.g., email already exists)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }
    
    // Generic server error
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
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
