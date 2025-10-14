const express = require("express");
const Joi = require("joi");
const Event = require("../models/Event");
const User = require("../models/User");
const Service = require("../models/Service");
const Order = require("../models/Order");
const {
  protect,
  authorize,
  requireApprovedSupplier,
} = require("../middleware/auth");
const Ticket = require("../models/Ticket");
const emailService = require("../services/emailService");
const router = express.Router();

// Enhanced validation schemas
const timePattern24 = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM 24h
const timePattern12 = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/; // HH:MM AM/PM
const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/; // HH:MM 24h

const createEventSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  description: Joi.string().max(2000).allow("").optional(),

  image: Joi.any().optional(),
  password: Joi.string().min(6).optional().messages({
    "string.min": "Password must be at least 6 characters long",
  }),
  startDate: Joi.date().required().messages({
    "date.base": "Start date must be a valid date",
    "any.required": "Start date is required",
  }),
  startTime: Joi.string().pattern(timePattern).required().messages({
    "string.pattern.base": "Start time must be in HH:MM format (e.g., 14:30)",
    "any.required": "Start time is required",
  }),
  endDate: Joi.date().required().messages({
    "date.base": "End date must be a valid date",
    "any.required": "End date is required",
  }),
  endTime: Joi.string().pattern(timePattern).required().messages({
    "string.pattern.base": "End time must be in HH:MM format (e.g., 18:00)",
    "any.required": "End time is required",
  }),
  location: Joi.object({
    address: Joi.string().required(),
    city: Joi.string().required(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
    }).optional(),
  }).required(),

  language: Joi.string().valid("he", "en", "ar").default("he"),
  category: Joi.string()
    .valid(
      "birthday",
      "wedding",
      "corporate",
      "conference",
      "workshop",
      "concert",
      "festival",
      "graduation",
      "anniversary",
      "baby-shower",
      "networking",
      "charity",
      "other"
    )
    .required(),

  requiredServices: Joi.array()
    .items(
      Joi.string().valid(
        "photography", // צלמים
        "videography", // וידאו
        "catering", // קייטרינג
        "bar", // בר
        "music", // מוזיקה
        "musicians", // אומנים
        "decoration", // תפאורה
        "scenery", // scenery / תפאורה
        "lighting", // תאורה
        "sound", // הגברה
        "sounds_lights", // הגברה ותאורה
        "transportation", // שירותי הסעות
        "security", // אבטחה
        "first_aid", // עזרה ראשונה
        "insurance", // ביטוח
        "furniture", // ריהוט
        "tents", // אוהלים
        "location", // מקומות להשכרה
        "dj", // DJ
        "other"
      )
    )
    .optional(),
  // Enhanced suppliers array to handle multiple services per supplier with package selection
  // Supports both nested (new) and flat (legacy) structures
  suppliers: Joi.array()
    .items(
      Joi.alternatives().try(
        // New nested structure: suppliers[0].services[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          services: Joi.array()
            .items(
              Joi.object({
                serviceId: Joi.string().required(),
                selectedPackageId: Joi.string().optional(),
                packageDetails: Joi.object({
                  name: Joi.string().optional(),
                  description: Joi.string().optional(),
                  price: Joi.number().min(0).optional(),
                  features: Joi.array().items(Joi.string()).optional(),
                  duration: Joi.number().optional(),
                }).optional(),
                requestedPrice: Joi.number().min(0).optional(),
                notes: Joi.string().max(500).optional(),
                priority: Joi.string()
                  .valid("low", "medium", "high")
                  .default("medium"),
              })
            )
            .min(1)
            .required(),
        }),
        // Legacy flat structure: suppliers[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          serviceId: Joi.string().required(),
          selectedPackageId: Joi.string().optional(),
          packageDetails: Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            price: Joi.number().min(0).optional(),
            features: Joi.array().items(Joi.string()).optional(),
            duration: Joi.number().optional(),
          }).optional(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string()
            .valid("low", "medium", "high")
            .default("medium"),
        })
      )
    )
    .optional(),
  isPublic: Joi.boolean().default(false),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).required(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
    }).optional(),
    isFree: Joi.boolean().optional(),
  }).optional(),
  tickets: Joi.array()
    .items(
      Joi.alternatives().try(
        // New simplified format
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.number().min(0).required(),
          currency: Joi.string()
            .valid("ILS", "USD", "EUR")
            .default("ILS")
            .optional(),
          quantity: Joi.number().min(1).required(),
        }),
        // Legacy nested format (for backward compatibility)
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.object({
            amount: Joi.number().min(0).required(),
            currency: Joi.string()
              .valid("ILS", "USD", "EUR")
              .default("ILS")
              .optional(),
            originalPrice: Joi.number().min(0).optional().allow(null),
            discount: Joi.number().min(0).max(100).optional().allow(null),
          }).required(),
          quantity: Joi.alternatives()
            .try(
              Joi.number().min(1).required(),
              Joi.object({
                total: Joi.number().min(1).required(),
                available: Joi.number().min(1).required(),
                sold: Joi.number().optional(),
                reserved: Joi.number().optional(),
              }).required()
            )
            .required(),
          restrictions: Joi.object({
            ageLimit: Joi.object({
              min: Joi.number().min(0).optional(),
              max: Joi.number().min(0).optional(),
            }).optional(),
            maxPerPerson: Joi.number().min(1).optional(),
            requiresId: Joi.boolean().optional(),
            specialRequirements: Joi.string().optional(),
          }).optional(),
        })
      )
    )
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().default(false).optional(),
  status: Joi.string()
    .valid("draft", "approved", "rejected", "completed")
    .optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object()
      .pattern(Joi.string(), Joi.number().min(0))
      .optional(),
    spent: Joi.number().min(0).optional(),
  }).optional(),

  language: Joi.string().valid("he", "en", "ar").default("he"),
  category: Joi.string()
    .valid(
      "birthday",
      "wedding",
      "corporate",
      "conference",
      "workshop",
      "concert",
      "festival",
      "graduation",
      "anniversary",
      "baby-shower",
      "networking",
      "charity",
      "other"
    )
    .required(),

  requiredServices: Joi.array()
    .items(
      Joi.string().valid(
        "photography", // צלמים
        "videography", // וידאו
        "catering", // קייטרינג
        "bar", // בר
        "music", // מוזיקה
        "musicians", // אומנים
        "decoration", // תפאורה
        "scenery", // scenery / תפאורה
        "lighting", // תאורה
        "sound", // הגברה
        "sounds_lights", // הגברה ותאורה
        "transportation", // שירותי הסעות
        "security", // אבטחה
        "first_aid", // עזרה ראשונה
        "insurance", // ביטוח
        "furniture", // ריהוט
        "tents", // אוהלים
        "location", // מקומות להשכרה
        "dj", // DJ
        "other"
      )
    )
    .optional(),
  // Enhanced suppliers array to handle multiple services per supplier with package selection
  // Supports both nested (new) and flat (legacy) structures
  suppliers: Joi.array()
    .items(
      Joi.alternatives().try(
        // New nested structure: suppliers[0].services[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          services: Joi.array()
            .items(
              Joi.object({
                serviceId: Joi.string().required(),
                selectedPackageId: Joi.string().optional(),
                packageDetails: Joi.object({
                  name: Joi.string().optional(),
                  description: Joi.string().optional(),
                  price: Joi.number().min(0).optional(),
                  features: Joi.array().items(Joi.string()).optional(),
                  duration: Joi.number().optional(),
                }).optional(),
                requestedPrice: Joi.number().min(0).optional(),
                notes: Joi.string().max(500).optional(),
                priority: Joi.string()
                  .valid("low", "medium", "high")
                  .default("medium"),
              })
            )
            .min(1)
            .required(),
        }),
        // Legacy flat structure: suppliers[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          serviceId: Joi.string().required(),
          selectedPackageId: Joi.string().optional(),
          packageDetails: Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            price: Joi.number().min(0).optional(),
            features: Joi.array().items(Joi.string()).optional(),
            duration: Joi.number().optional(),
          }).optional(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string()
            .valid("low", "medium", "high")
            .default("medium"),
        })
      )
    )
    .optional(),
  isPublic: Joi.boolean().default(false),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).required(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
    }).optional(),
    isFree: Joi.boolean().optional(),
  }).optional(),
  tickets: Joi.array()
    .items(
      Joi.alternatives().try(
        // New simplified format
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.number().min(0).required(),
          currency: Joi.string()
            .valid("ILS", "USD", "EUR")
            .default("ILS")
            .optional(),
          quantity: Joi.number().min(1).required(),
        }),
        // Legacy nested format (for backward compatibility)
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.object({
            amount: Joi.number().min(0).required(),
            currency: Joi.string()
              .valid("ILS", "USD", "EUR")
              .default("ILS")
              .optional(),
            originalPrice: Joi.number().min(0).optional().allow(null),
            discount: Joi.number().min(0).max(100).optional().allow(null),
          }).required(),
          quantity: Joi.alternatives()
            .try(
              Joi.number().min(1).required(),
              Joi.object({
                total: Joi.number().min(1).required(),
                available: Joi.number().min(1).required(),
                sold: Joi.number().optional(),
                reserved: Joi.number().optional(),
              }).required()
            )
            .required(),
          restrictions: Joi.object({
            ageLimit: Joi.object({
              min: Joi.number().min(0).optional(),
              max: Joi.number().min(0).optional(),
            }).optional(),
            maxPerPerson: Joi.number().min(1).optional(),
            requiresId: Joi.boolean().optional(),
            specialRequirements: Joi.string().optional(),
          }).optional(),
        })
      )
    )
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().default(false).optional(),
  status: Joi.string()
    .valid("draft", "approved", "rejected", "completed")
    .optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object()
      .pattern(Joi.string(), Joi.number().min(0))
      .optional(),
    spent: Joi.number().min(0).optional(),
  }).optional(),

  language: Joi.string().valid("he", "en", "ar").default("he"),
  category: Joi.string()
    .valid(
      "birthday",
      "wedding",
      "corporate",
      "conference",
      "workshop",
      "concert",
      "festival",
      "graduation",
      "anniversary",
      "baby-shower",
      "networking",
      "charity",
      "other"
    )
    .required(),

  requiredServices: Joi.array()
    .items(
      Joi.string().valid(
        "photography", // צלמים
        "videography", // וידאו
        "catering", // קייטרינג
        "bar", // בר
        "music", // מוזיקה
        "musicians", // אומנים
        "decoration", // תפאורה
        "scenery", // scenery / תפאורה
        "lighting", // תאורה
        "sound", // הגברה
        "sounds_lights", // הגברה ותאורה
        "transportation", // שירותי הסעות
        "security", // אבטחה
        "first_aid", // עזרה ראשונה
        "insurance", // ביטוח
        "furniture", // ריהוט
        "tents", // אוהלים
        "location", // מקומות להשכרה
        "dj", // DJ
        "other"
      )
    )
    .optional(),
  // Enhanced suppliers array to handle multiple services per supplier with package selection
  // Supports both nested (new) and flat (legacy) structures
  suppliers: Joi.array()
    .items(
      Joi.alternatives().try(
        // New nested structure: suppliers[0].services[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          services: Joi.array()
            .items(
              Joi.object({
                serviceId: Joi.string().required(),
                selectedPackageId: Joi.string().optional(),
                packageDetails: Joi.object({
                  name: Joi.string().optional(),
                  description: Joi.string().optional(),
                  price: Joi.number().min(0).optional(),
                  features: Joi.array().items(Joi.string()).optional(),
                  duration: Joi.number().optional(),
                }).optional(),
                requestedPrice: Joi.number().min(0).optional(),
                notes: Joi.string().max(500).optional(),
                priority: Joi.string()
                  .valid("low", "medium", "high")
                  .default("medium"),
              })
            )
            .min(1)
            .required(),
        }),
        // Legacy flat structure: suppliers[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          serviceId: Joi.string().required(),
          selectedPackageId: Joi.string().optional(),
          packageDetails: Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            price: Joi.number().min(0).optional(),
            features: Joi.array().items(Joi.string()).optional(),
            duration: Joi.number().optional(),
          }).optional(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string()
            .valid("low", "medium", "high")
            .default("medium"),
        })
      )
    )
    .optional(),
  isPublic: Joi.boolean().default(false),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).required(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
    }).optional(),
    isFree: Joi.boolean().optional(),
  }).optional(),
  tickets: Joi.array()
    .items(
      Joi.alternatives().try(
        // New simplified format
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.number().min(0).required(),
          currency: Joi.string()
            .valid("ILS", "USD", "EUR")
            .default("ILS")
            .optional(),
          quantity: Joi.number().min(1).required(),
        }),
        // Legacy nested format (for backward compatibility)
        Joi.object({
          title: Joi.string().max(200).required(),
          description: Joi.string().max(1000).optional(),
          type: Joi.string().max(100).required(),
          price: Joi.object({
            amount: Joi.number().min(0).required(),
            currency: Joi.string()
              .valid("ILS", "USD", "EUR")
              .default("ILS")
              .optional(),
            originalPrice: Joi.number().min(0).optional().allow(null),
            discount: Joi.number().min(0).max(100).optional().allow(null),
          }).required(),
          quantity: Joi.alternatives()
            .try(
              Joi.number().min(1).required(),
              Joi.object({
                total: Joi.number().min(1).required(),
                available: Joi.number().min(1).required(),
                sold: Joi.number().optional(),
                reserved: Joi.number().optional(),
              }).required()
            )
            .required(),
          restrictions: Joi.object({
            ageLimit: Joi.object({
              min: Joi.number().min(0).optional(),
              max: Joi.number().min(0).optional(),
            }).optional(),
            maxPerPerson: Joi.number().min(1).optional(),
            requiresId: Joi.boolean().optional(),
            specialRequirements: Joi.string().optional(),
          }).optional(),
        })
      )
    )
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().default(false).optional(),
  status: Joi.string()
    .valid("draft", "approved", "rejected", "completed")
    .optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object()
      .pattern(Joi.string(), Joi.number().min(0))
      .optional(),
    spent: Joi.number().min(0).optional(),
  }).optional(),
});

const updateEventSchema = Joi.object({
  name: Joi.string().min(2).max(200).optional(),
  description: Joi.string().max(2000).allow("").optional(),
  image: Joi.any().optional(),
  password: Joi.string().min(6).optional().messages({
    "string.min": "Password must be at least 6 characters long",
  }),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  location: Joi.object({
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
    }).optional(),
  }).optional(),
  language: Joi.string().valid("he", "en", "ar").optional(),
  category: Joi.string()
    .valid(
      "birthday",
      "wedding",
      "corporate",
      "conference",
      "workshop",
      "concert",
      "festival",
      "graduation",
      "anniversary",
      "baby-shower",
      "networking",
      "charity",
      "other"
    )
    .optional(),
  requiredServices: Joi.array()
    .items(
      Joi.string().valid(
        "photography", // צלמים
        "videography", // וידאו
        "catering", // קייטרינג
        "bar", // בר
        "music", // מוזיקה
        "musicians", // אומנים
        "decoration", // תפאורה
        "scenery", // scenery / תפאורה
        "lighting", // תאורה
        "sound", // הגברה
        "sounds_lights", // הגברה ותאורה
        "transportation", // שירותי הסעות
        "security", // אבטחה
        "first_aid", // עזרה ראשונה
        "insurance", // ביטוח
        "furniture", // ריהוט
        "tents", // אוהלים
        "location", // מקומות להשכרה
        "dj", // DJ
        "other"
      )
    )
    .optional(),
  // Supports both nested (new) and flat (legacy) structures with package selection
  // Also handles populated objects from frontend

  startTime: Joi.string()
    .pattern(timePattern24)
    .pattern(timePattern12)
    .optional()
    .messages({
      "string.pattern.base":
        "Start time must be in valid format (HH:MM 24h or HH:MM AM/PM)",
    }),

  endTime: Joi.string()
    .pattern(timePattern24)
    .pattern(timePattern12)
    .optional()
    .messages({
      "string.pattern.base":
        "End time must be in valid format (HH:MM 24h or HH:MM AM/PM)",
    }),

  suppliers: Joi.array()
    .items(
      Joi.alternatives().try(
        // New nested structure: suppliers[0].services[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          services: Joi.array()
            .items(
              Joi.object({
                serviceId: Joi.string().required(),
                selectedPackageId: Joi.string().optional(),
                packageDetails: Joi.object({
                  name: Joi.string().optional(),
                  description: Joi.string().optional(),
                  price: Joi.number().min(0).optional(),
                  features: Joi.array().items(Joi.string()).optional(),
                  duration: Joi.number().optional(),
                }).optional(),
                requestedPrice: Joi.number().min(0).optional(),
                notes: Joi.string().max(500).optional(),
                priority: Joi.string()
                  .valid("low", "medium", "high")
                  .default("medium"),
              })
            )
            .min(1)
            .required(),
        }),
        // Legacy flat structure: suppliers[0].serviceId
        Joi.object({
          supplierId: Joi.string().required(),
          serviceId: Joi.string().required(),
          selectedPackageId: Joi.string().optional(),
          packageDetails: Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            price: Joi.number().min(0).optional(),
            features: Joi.array().items(Joi.string()).optional(),
            duration: Joi.number().optional(),
          }).optional(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string()
            .valid("low", "medium", "high")
            .default("medium"),
        }),
        // Populated structure from frontend (ignore these - they're already in DB)
        Joi.object().unknown(true)
      )
    )
    .optional(),
  isPublic: Joi.boolean().optional(),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).optional(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
    }).optional(),
    isFree: Joi.boolean().optional(),
  }).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  status: Joi.string()
    .valid("draft", "approved", "rejected", "completed")
    .optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object()
      .pattern(Joi.string(), Joi.number().min(0))
      .optional(),
    spent: Joi.number().min(0).optional(),
  }).optional(),
}).unknown(true);

const addSuppliersSchema = Joi.object({
  suppliers: Joi.array()
    .items(
      Joi.object({
        supplierId: Joi.string().required(),
        services: Joi.array()
          .items(
            Joi.object({
              serviceId: Joi.string().required(),
              selectedPackageId: Joi.string().optional(),
              packageDetails: Joi.object({
                name: Joi.string().optional(),
                description: Joi.string().optional(),
                price: Joi.number().min(0).optional(),
                features: Joi.array().items(Joi.string()).optional(),
                duration: Joi.number().optional(),
              }).optional(),
              requestedPrice: Joi.number().min(0).optional(),
              notes: Joi.string().max(500).optional(),
              priority: Joi.string()
                .valid("low", "medium", "high")
                .default("medium"),
            })
          )
          .min(1)
          .required(),
      })
    )
    .min(1)
    .required(),
});

const updateSupplierStatusSchema = Joi.object({
  supplierId: Joi.string().optional(),
  serviceId: Joi.object().optional(),
  status: Joi.string().valid("approved", "rejected").required(),
});

const verifyPasswordSchema = Joi.object({
  password: Joi.string().required().messages({
    "any.required": "Password is required",
    "string.empty": "Password cannot be empty",
  }),
});

// @desc    Create new event with multiple suppliers and services
// @route   POST /api/events
// @access  Private (Producers only)
router.post("/", protect, authorize("producer"), async (req, res) => {
  try {
    // Validate input
    console.log("req.body----?", req.body);
    const { error, value } = createEventSchema.validate(req.body);

    console.log("error : ", error);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details.map((detail) => detail.message),
      });
    }

    // Validate suppliers and services exist
    if (value.suppliers && value.suppliers.length > 0) {
      const supplierIds = value.suppliers.map((s) => s.supplierId);
      const serviceIds = value.suppliers.flatMap((s) =>
        s.services.map((srv) => srv.serviceId)
      );

      // Check if all suppliers exist and are verified
      const suppliers = await User.find({
        _id: { $in: supplierIds },
        role: "supplier",
        isVerified: true,
        isActive: true,
      });

      if (suppliers.length !== supplierIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more suppliers not found or not verified",
        });
      }

      // Check if all services exist and belong to the respective suppliers
      const services = await Service.find({ _id: { $in: serviceIds } });
      if (services.length !== serviceIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more services not found",
        });
      }

      // Validate that each service belongs to the correct supplier
      for (const supplierData of value.suppliers) {
        const supplierServices = services.filter(
          (s) => s.supplierId.toString() === supplierData.supplierId
        );

        const requestedServiceIds = supplierData.services.map(
          (s) => s.serviceId
        );
        const availableServiceIds = supplierServices.map((s) =>
          s._id.toString()
        );

        const invalidServices = requestedServiceIds.filter(
          (id) => !availableServiceIds.includes(id)
        );

        if (invalidServices.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Services ${invalidServices.join(
              ", "
            )} do not belong to supplier ${supplierData.supplierId}`,
          });
        }
      }
    }

    // Transform suppliers data for the schema with package information
    const transformedSuppliers = value.suppliers
      ? value.suppliers.flatMap((supplier) =>
          supplier.services.map((service) => {
            const supplierData = {
              supplierId: supplier.supplierId,
              serviceId: service.serviceId,
              requestedPrice: service.requestedPrice,
              notes: service.notes,
              priority: service.priority,
              status: "pending",
            };

            // Only add package info if it's actually provided
            if (service.selectedPackageId) {
              supplierData.selectedPackageId = service.selectedPackageId;
            }

            if (
              service.packageDetails &&
              Object.keys(service.packageDetails).length > 0
            ) {
              supplierData.packageDetails = service.packageDetails;
            }

            return supplierData;
          })
        )
      : [];

    // Create event
    const eventData = {
      ...value,
      suppliers: transformedSuppliers,
      producerId: req.user._id,
    };

    // If ticketInfo is not provided, set default values to satisfy model requirements
    if (!eventData.ticketInfo) {
      eventData.ticketInfo = {
        availableTickets: 0,
        soldTickets: 0,
        reservedTickets: 0,
        priceRange: {
          min: 0,
          max: 0,
        },
        isFree: true,
      };
    } else {
      // Ensure isFree is set if not provided
      if (eventData.ticketInfo.isFree === undefined) {
        eventData.ticketInfo.isFree = true;
      }
      // Ensure priceRange exists
      if (!eventData.ticketInfo.priceRange) {
        eventData.ticketInfo.priceRange = {
          min: 0,
          max: 0,
        };
      }
    }

    // Extract tickets array if provided
    const ticketsToCreate = eventData.tickets || [];
    delete eventData.suppliers; // Remove the transformed suppliers temporarily
    delete eventData.tickets; // Remove tickets array temporarily

    const event = await Event.create(eventData);

    // Create ticket documents if tickets array was provided

    if (ticketsToCreate.length > 0) {
      const ticketDocuments = ticketsToCreate.map((ticket) => {
        // Handle both simplified and nested formats
        const priceAmount =
          typeof ticket.price === "number" ? ticket.price : ticket.price.amount;
        const currency =
          ticket.currency ||
          (typeof ticket.price === "object" ? ticket.price.currency : null) ||
          "ILS";
        const quantity =
          typeof ticket.quantity === "number"
            ? ticket.quantity
            : ticket.quantity.total;

        return {
          eventId: event._id,
          eventName: event.name,
          title: ticket.title,
          description: ticket.description || "",
          type: ticket.type,
          price: {
            amount: priceAmount,
            currency: currency,
          },
          quantity: {
            total: quantity,
            available: quantity,
            sold: 0,
            reserved: 0,
          },
          status: "active",
          validity: {
            startDate: event.startDate,
            endDate: event.endDate,
            isActive: true,
          },
          sales: {
            startDate: event.startDate,
            endDate: event.endDate,
          },
          restrictions: {
            maxPerPerson: 10,
          },
          refundPolicy: {
            allowed: true,
            deadline: 7,
            fee: 0,
          },
        };
      });

      const createdTickets = await Ticket.insertMany(ticketDocuments);
      console.log(
        `Created ${createdTickets.length} tickets for event ${event._id}`
      );

      // Update event's ticketInfo based on created tickets
      const totalTickets = ticketsToCreate.reduce((sum, t) => {
        const qty =
          typeof t.quantity === "number" ? t.quantity : t.quantity.total;
        return sum + qty;
      }, 0);
      const prices = ticketsToCreate.map((t) =>
        typeof t.price === "number" ? t.price : t.price.amount
      );

      event.ticketInfo = {
        availableTickets: totalTickets,
        soldTickets: 0,
        reservedTickets: 0,
        priceRange: {
          min: Math.min(...prices),
          max: Math.max(...prices),
        },
        isFree: Math.min(...prices) === 0,
      };

      await event.save();
      console.log(
        `Updated event ticketInfo: ${totalTickets} total tickets, price range: ${Math.min(
          ...prices
        )} - ${Math.max(...prices)}`
      );
    }

    // Add suppliers using the model method with package information
    for (const supplier of transformedSuppliers) {
      const details = {
        requestedPrice: supplier.requestedPrice,
        notes: supplier.notes,
        priority: supplier.priority,
      };

      // Only add package info if it exists
      if (supplier.selectedPackageId) {
        details.selectedPackageId = supplier.selectedPackageId;
      }

      if (supplier.packageDetails) {
        details.packageDetails = supplier.packageDetails;
      }

      await event.addSupplierWithDetails(
        supplier.supplierId,
        supplier.serviceId,
        details
      );
    }

    // Populate and return the created event with full details
    const populatedEvent = await Event.findById(event._id)
      .populate("producerId", "name companyName profileImage email phone")
      .populate(
        "suppliers.supplierId",
        "name companyName profileImage email phone supplierDetails"
      )
      .populate(
        "suppliers.serviceId",
        "title description price category subcategories tags availability location experience rating portfolio packages featured"
      )
      .populate("tickets");

    // Send event created email to producer
    try {
      await emailService.sendEventCreatedEmail(req.user, populatedEvent);
      console.log("✅ Event created email sent to producer");
    } catch (emailError) {
      console.error("❌ Failed to send event created email:", emailError);
      // Don't fail the request if email fails
    }

    // Send invitation emails to all suppliers
    if (populatedEvent.suppliers && populatedEvent.suppliers.length > 0) {
      for (const supplierEntry of populatedEvent.suppliers) {
        if (supplierEntry.supplierId && supplierEntry.serviceId) {
          try {
            await emailService.sendEventInvitationEmail(
              supplierEntry.supplierId,
              populatedEvent,
              req.user,
              supplierEntry.serviceId
            );
            console.log(
              `✅ Invitation email sent to supplier ${supplierEntry.supplierId.email}`
            );
          } catch (emailError) {
            console.error(
              `❌ Failed to send invitation email to supplier ${supplierEntry.supplierId._id}:`,
              emailError
            );
            // Continue with other suppliers even if one fails
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      data: populatedEvent,
      message: "Event created successfully with suppliers and services",
    });
  } catch (error) {
    console.error("Create event error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating event",
      error: error.message,
    });
  }
});

// @desc    Add multiple suppliers with multiple services to existing event
// @route   POST /api/events/:id/suppliers
// @access  Private (Event producer only)
router.post("/:id/suppliers", protect, async (req, res) => {
  try {
    const { error, value } = addSuppliersSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.details.map((detail) => detail.message),
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to modify this event",
      });
    }

    // Validate suppliers and services
    const supplierIds = value.suppliers.map((s) => s.supplierId);
    const serviceIds = value.suppliers.flatMap((s) =>
      s.services.map((srv) => srv.serviceId)
    );

    const suppliers = await User.find({
      _id: { $in: supplierIds },
      role: "supplier",
      isVerified: true,
      isActive: true,
    });

    if (suppliers.length !== supplierIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more suppliers not found or not verified",
      });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more services not found",
      });
    }

    // Add suppliers and services with package information
    const addedSuppliers = [];
    const errors = [];

    for (const supplierData of value.suppliers) {
      for (const serviceData of supplierData.services) {
        try {
          await event.addSupplierWithDetails(
            supplierData.supplierId,
            serviceData.serviceId,
            {
              requestedPrice: serviceData.requestedPrice,
              notes: serviceData.notes,
              priority: serviceData.priority,
              selectedPackageId: serviceData.selectedPackageId,
              packageDetails: serviceData.packageDetails,
            }
          );
          addedSuppliers.push({
            supplierId: supplierData.supplierId,
            serviceId: serviceData.serviceId,
            selectedPackageId: serviceData.selectedPackageId,
          });
        } catch (err) {
          errors.push({
            supplierId: supplierData.supplierId,
            serviceId: serviceData.serviceId,
            error: err.message,
          });
        }
      }
    }

    const updatedEvent = await Event.findById(req.params.id)
      .populate("producerId", "name companyName profileImage email phone")
      .populate(
        "suppliers.supplierId",
        "name companyName profileImage email phone supplierDetails"
      )
      .populate(
        "suppliers.serviceId",
        "title description price category subcategories tags availability location experience rating portfolio packages featured"
      )
      .populate("tickets");

    // Send invitation emails to newly added suppliers
    if (addedSuppliers.length > 0) {
      for (const addedSupplier of addedSuppliers) {
        const supplierEntry = updatedEvent.suppliers.find(
          (s) =>
            s.supplierId._id.toString() === addedSupplier.supplierId &&
            s.serviceId._id.toString() === addedSupplier.serviceId
        );

        if (
          supplierEntry &&
          supplierEntry.supplierId &&
          supplierEntry.serviceId
        ) {
          try {
            await emailService.sendEventInvitationEmail(
              supplierEntry.supplierId,
              updatedEvent,
              updatedEvent.producerId,
              supplierEntry.serviceId
            );
            console.log(
              `✅ Invitation email sent to supplier ${supplierEntry.supplierId.email}`
            );
          } catch (emailError) {
            console.error(
              `❌ Failed to send invitation email to supplier ${supplierEntry.supplierId._id}:`,
              emailError
            );
            // Continue with other suppliers even if one fails
          }
        }
      }
    }

    res.json({
      success: true,
      data: updatedEvent,
      message: `Successfully added ${addedSuppliers.length} supplier-service combinations`,
      details: {
        added: addedSuppliers,
        errors: errors,
      },
    });
  } catch (error) {
    console.error("Add suppliers error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding suppliers",
      error: error.message,
    });
  }
});

// @desc    Update supplier service status with bulk operations
// @route   PUT /api/events/:id/suppliers/bulk-status
// @access  Private (Event producer only)
router.put("/:id/suppliers/bulk-status", protect, async (req, res) => {
  try {
    const { updates } = req.body; // Array of {supplierId, serviceId, status}

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to modify this event",
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        if (
          !["pending", "approved", "cancelled", "rejected"].includes(
            update.status
          )
        ) {
          throw new Error("Invalid status");
        }

        await event.updateSupplierStatus(
          update.supplierId,
          update.serviceId,
          update.status
        );
        results.push({
          supplierId: update.supplierId,
          serviceId: update.serviceId,
          status: update.status,
          success: true,
        });
      } catch (err) {
        errors.push({
          supplierId: update.supplierId,
          serviceId: update.serviceId,
          error: err.message,
        });
      }
    }

    const updatedEvent = await Event.findById(req.params.id)
      .populate(
        "suppliers.supplierId",
        "name companyName profileImage email phone supplierDetails"
      )
      .populate(
        "suppliers.serviceId",
        "title description price category subcategories tags availability location experience rating portfolio packages featured"
      )
      .populate("tickets");

    res.json({
      success: true,
      data: updatedEvent,
      message: `Processed ${results.length} status updates`,
      details: { results, errors },
    });
  } catch (error) {
    console.error("Bulk status update error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating supplier statuses",
      error: error.message,
    });
  }
});

// @desc    Remove supplier service from event
// @route   DELETE /api/events/:id/suppliers/:supplierId/:serviceId
// @access  Private (Event producer only)
router.delete(
  "/:id/suppliers/:supplierId/:serviceId",
  protect,
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found",
        });
      }

      if (event.producerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this event",
        });
      }

      await event.removeSupplier(req.params.supplierId, req.params.serviceId);

      res.json({
        success: true,
        message: "Supplier service removed successfully",
      });
    } catch (error) {
      console.error("Remove supplier error:", error);
      res.status(500).json({
        success: false,
        message: "Error removing supplier service",
        error: error.message,
      });
    }
  }
);

// @desc    Update supplier status for event
// @route   PUT /api/events/:eventId/supplier-status
router.put("/:eventId/supplier-status", protect, async (req, res) => {
  try {
    // Validate input

    console.log(req.body);
    const { error, value } = updateSupplierStatusSchema.validate(req.body);

    console.log("error : ", error);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details.map((detail) => detail.message),
      });
    }

    const { supplierId, serviceId, status } = value;

    // Find the event
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    console.log("supplierId--->", supplierId);
    console.log("serviceId--->", serviceId);

    // Find the supplier in the event
    const supplierIndex = event.suppliers.findIndex(
      (s) =>
        s.supplierId.toString() === supplierId &&
        s.serviceId.toString() === serviceId._id
    );

    if (supplierIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Supplier service not found in this event",
      });
    }

    // Update the supplier status
    event.suppliers[supplierIndex].status = status;

    // Set confirmation timestamp if approved
    if (status === "approved") {
      event.suppliers[supplierIndex].confirmedAt = new Date();
    }

    // Update the main event status based on supplier status
    if (status === "approved") {
      event.status = "approved"; // Change from draft to approved when supplier is approved
    } else if (status === "rejected") {
      event.status = "rejected"; // Change to rejected when supplier is rejected
    }

    // Save the event
    await event.save();

    // Populate and return the updated event with full details
    const updatedEvent = await Event.findById(req.params.eventId)
      .populate("producerId", "name companyName profileImage email phone")
      .populate(
        "suppliers.supplierId",
        "name companyName profileImage email phone supplierDetails"
      )
      .populate(
        "suppliers.serviceId",
        "title description price category subcategories tags availability location experience rating portfolio packages featured"
      )
      .populate("tickets");

    // Send email notifications based on status change
    const supplierData = updatedEvent.suppliers[supplierIndex];
    if (
      supplierData.supplierId &&
      supplierData.serviceId &&
      updatedEvent.producerId
    ) {
      try {
        if (status === "approved") {
          // Send approval email to producer
          await emailService.sendSupplierApprovedEventEmail(
            updatedEvent.producerId,
            updatedEvent,
            supplierData.supplierId,
            supplierData.serviceId
          );
          console.log("✅ Supplier approved event email sent to producer");
        } else if (status === "rejected") {
          // Send rejection email to producer
          await emailService.sendSupplierRejectedEventEmail(
            updatedEvent.producerId,
            updatedEvent,
            supplierData.supplierId,
            supplierData.serviceId
          );
          console.log("✅ Supplier rejected event email sent to producer");
        }
      } catch (emailError) {
        console.error("❌ Failed to send status update email:", emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      data: updatedEvent,
      message: `Supplier status updated to ${status} successfully`,
    });
  } catch (error) {
    console.error("Update supplier status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating supplier status",
      error: error.message,
    });
  }
});

// @desc    Get event suppliers with their services
// @route   GET /api/events/:id/suppliers
// @access  Public
router.get("/:id/suppliers", async (req, res) => {
  try {
    const { status, category } = req.query;

    const event = await Event.findById(req.params.id)
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { isActive: true },
      })
      .populate({
        path: "suppliers.serviceId",
        select:
          "title description price category subcategories tags availability location experience rating portfolio packages featured",
        match: category ? { category } : {},
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    let suppliers = event.suppliers.filter((s) => s.supplierId && s.serviceId);

    if (status) {
      suppliers = suppliers.filter((s) => s.status === status);
    }

    // Group by supplier
    const groupedSuppliers = suppliers.reduce((acc, supplier) => {
      const supplierId = supplier.supplierId._id.toString();
      if (!acc[supplierId]) {
        acc[supplierId] = {
          supplier: supplier.supplierId,
          services: [],
        };
      }
      acc[supplierId].services.push({
        service: supplier.serviceId,
        status: supplier.status,
        requestedPrice: supplier.requestedPrice,
        notes: supplier.notes,
        priority: supplier.priority,
        confirmedAt: supplier.confirmedAt,
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: Object.values(groupedSuppliers),
      count: Object.keys(groupedSuppliers).length,
    });
  } catch (error) {
    console.error("Get event suppliers error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching event suppliers",
      error: error.message,
    });
  }
});

// @desc    Get supplier recommendations for event
// @route   GET /api/events/:id/supplier-recommendations
// @access  Private (Event producer only)
router.get("/:id/supplier-recommendations", protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this event",
      });
    }

    const { category, maxPrice, minRating } = req.query;

    // Find suppliers in the same city with required services
    const filter = {
      role: "supplier",
      isVerified: true,
      isActive: true,
    };

    if (minRating) {
      filter["supplierDetails.rating.average"] = {
        $gte: parseFloat(minRating),
      };
    }

    const suppliers = await User.find(filter)
      .populate({
        path: "services",
        match: {
          isActive: true,
          ...(category && { category }),
          ...(maxPrice && { "price.amount": { $lte: parseFloat(maxPrice) } }),
        },
      })
      .sort({ "supplierDetails.rating.average": -1 })
      .limit(20);

    // Filter suppliers who have at least one matching service
    const recommendations = suppliers
      .filter((supplier) => supplier.services && supplier.services.length > 0)
      .map((supplier) => ({
        supplier: {
          _id: supplier._id,
          name: supplier.name,
          companyName: supplier.supplierDetails?.companyName,
          profileImage: supplier.profileImage,
          rating: supplier.supplierDetails?.rating,
          experience: supplier.supplierDetails?.experience,
        },
        services: supplier.services,
        matchingServices: supplier.services.filter(
          (service) =>
            !event.requiredServices ||
            event.requiredServices.includes(service.category)
        ).length,
      }))
      .sort((a, b) => b.matchingServices - a.matchingServices);

    res.json({
      success: true,
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error("Get supplier recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier recommendations",
      error: error.message,
    });
  }
});

// @desc    Get all events created by the current logged-in producer with full details
// @route   GET /api/events/my-events
// @access  Private (Producer only)
router.get("/my-events", protect, authorize("producer"), async (req, res) => {
  try {
    const producerId = req.user._id; // Current logged-in producer ID

    const {
      page = 1,
      limit = 10,
      status, // Event status filter
      category, // Event category filter
      search, // Search term
      sortBy = "createdAt",
      sortOrder = "desc",
      startDate, // Filter by event start date
      endDate, // Filter by event end date
    } = req.query;

    console.log("Producer ID:", producerId);
    console.log("Query parameters:", {
      page,
      limit,
      status,
      category,
      search,
      sortBy,
      sortOrder,
    });

    // Build filter for events created by this producer
    const filter = {
      producerId: producerId,
    };

    // Add status filter
    if (status) {
      filter.status = status;
    }

    // Add category filter
    if (category) {
      filter.category = category;
    }

    // Add date range filter
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    // Add search filter
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { "location.address": searchRegex },
        { "location.city": searchRegex },
      ];
    }

    console.log("MongoDB filter:", JSON.stringify(filter, null, 2));

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute query with full population including packages
    const events = await Event.find(filter)
      .populate("producerId", "name companyName profileImage email phone")
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { isActive: true },
      })
      .populate({
        path: "suppliers.serviceId",
        select:
          "title description price category subcategories tags availability location experience rating portfolio packages featured",
      })
      .populate("tickets")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    console.log(`Found ${events.length} events for producer ${producerId}`);

    // Enhance events with additional details and statistics
    const enhancedEvents = events.map((event) => {
      const eventObj = event.toObject({ virtuals: true });

      // Ensure all array fields are properly initialized to prevent frontend errors
      eventObj.suppliers = eventObj.suppliers || [];
      eventObj.requiredServices = eventObj.requiredServices || [];
      eventObj.tags = eventObj.tags || [];
      eventObj.tickets = eventObj.tickets || [];

      // Ensure nested objects are properly initialized
      if (!eventObj.location) {
        eventObj.location = { address: "", city: "", coordinates: {} };
      }
      if (!eventObj.ticketInfo) {
        eventObj.ticketInfo = {
          availableTickets: 0,
          soldTickets: 0,
          reservedTickets: 0,
        };
      }
      if (!eventObj.budget) {
        eventObj.budget = { total: 0, allocated: {}, spent: 0 };
      }

      // Add detailed ticket statistics
      const tickets = eventObj.tickets || [];
      const ticketStats = {
        totalTicketTypes: tickets.length,
        totalTicketsAvailable: tickets.reduce(
          (sum, t) => sum + (t.quantity?.total || 0),
          0
        ),
        totalTicketsSold: tickets.reduce(
          (sum, t) => sum + (t.quantity?.sold || 0),
          0
        ),
        totalTicketsRemaining: tickets.reduce((sum, t) => {
          const remaining =
            (t.quantity?.available || 0) -
            (t.quantity?.sold || 0) -
            (t.quantity?.reserved || 0);
          return sum + remaining;
        }, 0),
        totalRevenue: tickets.reduce(
          (sum, t) => sum + (t.quantity?.sold || 0) * (t.price?.amount || 0),
          0
        ),
        ticketTypes: tickets.map((t) => ({
          id: t._id,
          title: t.title,
          type: t.type,
          price: t.price?.amount || 0,
          currency: t.price?.currency || "ILS",
          total: t.quantity?.total || 0,
          sold: t.quantity?.sold || 0,
          available: t.quantity?.available || 0,
          remaining:
            (t.quantity?.available || 0) -
            (t.quantity?.sold || 0) -
            (t.quantity?.reserved || 0),
          status: t.status,
          soldPercentage:
            t.quantity?.total > 0
              ? (((t.quantity?.sold || 0) / t.quantity.total) * 100).toFixed(2)
              : 0,
          revenue: (t.quantity?.sold || 0) * (t.price?.amount || 0),
          isSoldOut:
            t.status === "sold_out" ||
            (t.quantity?.available || 0) -
              (t.quantity?.sold || 0) -
              (t.quantity?.reserved || 0) <=
              0,
        })),
        hasAvailableTickets: tickets.some((t) => {
          const remaining =
            (t.quantity?.available || 0) -
            (t.quantity?.sold || 0) -
            (t.quantity?.reserved || 0);
          return remaining > 0;
        }),
        allSoldOut:
          tickets.length > 0 &&
          tickets.every((t) => {
            const remaining =
              (t.quantity?.available || 0) -
              (t.quantity?.sold || 0) -
              (t.quantity?.reserved || 0);
            return remaining <= 0;
          }),
      };

      eventObj.ticketStats = ticketStats;

      // Add supplier statistics
      const suppliers = eventObj.suppliers || [];
      const uniqueSuppliers = [
        ...new Set(
          suppliers.map((s) => s.supplierId?._id?.toString()).filter(Boolean)
        ),
      ];

      eventObj.supplierStats = {
        totalSuppliers: uniqueSuppliers.length,
        totalServices: suppliers.length,
        approvedServices: suppliers.filter((s) => s.status === "approved")
          .length,
        pendingServices: suppliers.filter((s) => s.status === "pending").length,
        rejectedServices: suppliers.filter((s) => s.status === "rejected")
          .length,
        cancelledServices: suppliers.filter((s) => s.status === "cancelled")
          .length,
      };

      // Add financial summary
      const totalRequestedPrice = suppliers.reduce(
        (sum, s) => sum + (s.requestedPrice || 0),
        0
      );
      const totalFinalPrice = suppliers
        .filter((s) => s.status === "approved" && s.finalPrice)
        .reduce((sum, s) => sum + s.finalPrice, 0);

      eventObj.financialSummary = {
        totalRequestedPrice,
        totalFinalPrice,
        estimatedCost: totalFinalPrice || totalRequestedPrice,
        ticketRevenue: ticketStats.totalRevenue,
        totalRevenue:
          (totalFinalPrice || totalRequestedPrice) + ticketStats.totalRevenue,
        budgetUtilization: eventObj.budget?.total
          ? ((totalFinalPrice || totalRequestedPrice) / eventObj.budget.total) *
            100
          : 0,
      };

      // Group suppliers by supplier for better organization
      eventObj.groupedSuppliers = suppliers
        .filter((s) => s.supplierId && s.serviceId)
        .reduce((acc, supplier) => {
          const supplierId = supplier.supplierId._id.toString();
          if (!acc[supplierId]) {
            acc[supplierId] = {
              supplier: supplier.supplierId,
              services: [],
            };
          }
          acc[supplierId].services.push({
            service: supplier.serviceId,
            status: supplier.status,
            requestedPrice: supplier.requestedPrice,
            finalPrice: supplier.finalPrice,
            notes: supplier.notes,
            priority: supplier.priority,
            requestedAt: supplier.requestedAt,
            confirmedAt: supplier.confirmedAt,
            completedAt: supplier.completedAt,
            messages: supplier.messages || [],
          });
          return acc;
        }, {});

      // Convert grouped suppliers to array
      eventObj.groupedSuppliersArray = Object.values(eventObj.groupedSuppliers);

      // Add event status indicators
      eventObj.statusIndicators = {
        isUpcoming: new Date(eventObj.startDate) > new Date(),
        isPast: new Date(eventObj.endDate) < new Date(),
        isActive:
          new Date() >= new Date(eventObj.startDate) &&
          new Date() <= new Date(eventObj.endDate),
        daysUntilEvent: Math.ceil(
          (new Date(eventObj.startDate) - new Date()) / (1000 * 60 * 60 * 24)
        ),
        duration: Math.ceil(
          (new Date(eventObj.endDate) - new Date(eventObj.startDate)) /
            (1000 * 60 * 60 * 24)
        ),
      };

      return eventObj;
    });

    // Get total count for pagination - FIXED: Use the same filter that was used for the query
    const totalFilteredEvents = await Event.countDocuments(filter);

    // Calculate overall statistics for the producer
    const allProducerEvents = await Event.find({ producerId });
    const overallStats = {
      totalEvents: allProducerEvents.length,
      draftEvents: allProducerEvents.filter((e) => e.status === "draft").length,
      approvedEvents: allProducerEvents.filter((e) => e.status === "approved")
        .length,
      completedEvents: allProducerEvents.filter((e) => e.status === "completed")
        .length,
      rejectedEvents: allProducerEvents.filter((e) => e.status === "rejected")
        .length,
      upcomingEvents: allProducerEvents.filter(
        (e) => new Date(e.startDate) > new Date()
      ).length,
      pastEvents: allProducerEvents.filter(
        (e) => new Date(e.endDate) < new Date()
      ).length,
    };

    // Calculate total suppliers and services across all events
    let totalUniqueSuppliers = new Set();
    let totalServices = 0;
    let totalApprovedServices = 0;
    let totalSpent = 0;

    allProducerEvents.forEach((event) => {
      event.suppliers.forEach((supplier) => {
        if (supplier.supplierId) {
          totalUniqueSuppliers.add(supplier.supplierId.toString());
          totalServices++;
          if (supplier.status === "approved") {
            totalApprovedServices++;
            totalSpent += supplier.finalPrice || supplier.requestedPrice || 0;
          }
        }
      });
    });

    overallStats.totalUniqueSuppliers = totalUniqueSuppliers.size;
    overallStats.totalServices = totalServices;
    overallStats.totalApprovedServices = totalApprovedServices;
    overallStats.totalSpent = totalSpent;

    res.json({
      success: true,
      data: enhancedEvents,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalFilteredEvents / limit),
        totalEvents: totalFilteredEvents, // FIXED: Use filtered count, not all events
        hasNextPage: page * limit < totalFilteredEvents,
        hasPrevPage: page > 1,
      },
      overallStats,
      message: `Found ${enhancedEvents.length} events for producer`,
    });
  } catch (error) {
    console.error("Get producer events error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching producer events",
      error: error.message,
    });
  }
});

// @desc    Get all events (with filtering) - Enhanced version
// @route   GET /api/events
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      city,
      language,
      startDate,
      endDate,
      status,
      isPublic = true,
      featured,
      search,
      minPrice,
      maxPrice,
      hasAvailableTickets,
      supplierId,
      includePastEvents = false, // New parameter to optionally include past events
    } = req.query;

    // console.log(minPrice,maxPrice);

    console.log("category--->", category);

    // Build filter object
    const filter = { isPublic: true };

    // Filter out past events by default (only show current and future events)
    // Past events are those where endDate is before current date
    if (includePastEvents !== "true") {
      filter.endDate = { $gte: new Date() };
    }

    if (category) filter.category = category;
    if (city) filter["location.city"] = new RegExp(city, "i");
    if (language) filter.language = language;
    if (featured !== undefined) filter.featured = featured === "true";

    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    if (supplierId) {
      filter["suppliers.supplierId"] = supplierId;
    }

    if (minPrice || maxPrice) {
      const priceFilter = {};

      // For minPrice: find events where the maximum price is >= minPrice
      // This ensures we get events that have tickets at or above the minimum price we're looking for
      if (minPrice) {
        priceFilter["ticketInfo.priceRange.max"] = {
          $gte: parseFloat(minPrice),
        };
      }

      // For maxPrice: find events where the minimum price is <= maxPrice
      // This ensures we get events that have tickets at or below the maximum price we're willing to pay
      if (maxPrice) {
        priceFilter["ticketInfo.priceRange.min"] = {
          $lte: parseFloat(maxPrice),
        };
      }

      // Combine the price filters using $and to ensure both conditions are met
      if (minPrice && maxPrice) {
        filter.$and = filter.$and || [];
        filter.$and.push(priceFilter);
      } else {
        Object.assign(filter, priceFilter);
      }
    }

    if (hasAvailableTickets === "true") {
      filter.$expr = {
        $gt: ["$ticketInfo.availableTickets", "$ticketInfo.soldTickets"],
      };
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    // FIXED: Reset to page 1 when search is provided
    let currentPage = parseInt(page);
    if (search && search.trim()) {
      currentPage = 1;
    }

    // Execute query with pagination and full details
    const events = await Event.find(filter)
      .populate("producerId", "name companyName profileImage email phone")
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { isActive: true },
      })
      .populate({
        path: "suppliers.serviceId",
        select:
          "title description price category subcategories tags availability location experience rating portfolio packages featured",
      })
      .sort({ startDate: 1, featured: -1 })
      .limit(limit * 1)
      .skip((currentPage - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Event.countDocuments(filter);

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: currentPage,
        totalPages: Math.ceil(total / limit),
        totalEvents: total,
        hasNextPage: currentPage * limit < total,
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching events",
      error: error.message,
    });
  }
});

// @desc    Get single event with full supplier and service details - Enhanced for view page
// @route   GET /api/events/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("producerId", "name companyName profileImage email phone")
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { isActive: true },
      })
      .populate({
        path: "suppliers.serviceId",
        select:
          "title description price category subcategories tags availability location experience rating portfolio packages featured",
      })
      .populate("tickets");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Increment views for public events
    if (event.isPublic && event.status === "approved") {
      event.views += 1;
      await event.save();
    }

    // Convert to object to add computed fields
    const eventData = event.toObject({ virtuals: true });

    // Add event status indicators
    const now = new Date();
    const eventStartDate = new Date(eventData.startDate);
    const eventEndDate = new Date(eventData.endDate);

    eventData.eventStatus = {
      isUpcoming: eventStartDate > now,
      isActive: now >= eventStartDate && now <= eventEndDate,
      isPast: eventEndDate < now,
      hasStarted: eventStartDate <= now,
      hasEnded: eventEndDate < now,
      daysUntilStart: Math.ceil((eventStartDate - now) / (1000 * 60 * 60 * 24)),
      daysUntilEnd: Math.ceil((eventEndDate - now) / (1000 * 60 * 60 * 24)),
      duration: Math.ceil(
        (eventEndDate - eventStartDate) / (1000 * 60 * 60 * 24)
      ),
    };

    // Calculate remaining tickets
    const ticketInfo = eventData.ticketInfo || {};
    eventData.remainingTickets =
      (ticketInfo.availableTickets || 0) -
      (ticketInfo.soldTickets || 0) -
      (ticketInfo.reservedTickets || 0);

    eventData.ticketAvailability = {
      total: ticketInfo.availableTickets || 0,
      sold: ticketInfo.soldTickets || 0,
      reserved: ticketInfo.reservedTickets || 0,
      remaining: eventData.remainingTickets,
      percentageSold:
        ticketInfo.availableTickets > 0
          ? (
              ((ticketInfo.soldTickets || 0) / ticketInfo.availableTickets) *
              100
            ).toFixed(2)
          : 0,
      isAvailable: eventData.remainingTickets > 0,
    };

    // Group suppliers by supplier ID for better organization
    const groupedSuppliers = (eventData.suppliers || [])
      .filter((s) => s.supplierId && s.serviceId)
      .reduce((acc, supplier) => {
        const supplierId = supplier.supplierId._id.toString();
        if (!acc[supplierId]) {
          acc[supplierId] = {
            supplier: supplier.supplierId,
            services: [],
          };
        }
        acc[supplierId].services.push({
          service: supplier.serviceId,
          status: supplier.status,
          requestedPrice: supplier.requestedPrice,
          finalPrice: supplier.finalPrice,
          notes: supplier.notes,
          priority: supplier.priority,
          requestedAt: supplier.requestedAt,
          confirmedAt: supplier.confirmedAt,
          completedAt: supplier.completedAt,
          selectedPackageId: supplier.selectedPackageId,
          packageDetails: supplier.packageDetails,
          messages: supplier.messages || [],
        });
        return acc;
      }, {});

    eventData.groupedSuppliers = Object.values(groupedSuppliers);

    // Add supplier statistics
    const suppliers = eventData.suppliers || [];
    const uniqueSuppliers = [
      ...new Set(
        suppliers.map((s) => s.supplierId?._id?.toString()).filter(Boolean)
      ),
    ];

    eventData.supplierStats = {
      totalSuppliers: uniqueSuppliers.length,
      totalServices: suppliers.length,
      approvedServices: suppliers.filter((s) => s.status === "approved").length,
      pendingServices: suppliers.filter((s) => s.status === "pending").length,
      rejectedServices: suppliers.filter((s) => s.status === "rejected").length,
      cancelledServices: suppliers.filter((s) => s.status === "cancelled")
        .length,
    };

    // Add financial summary
    const totalRequestedPrice = suppliers.reduce(
      (sum, s) => sum + (s.requestedPrice || 0),
      0
    );
    const totalFinalPrice = suppliers
      .filter((s) => s.status === "approved" && s.finalPrice)
      .reduce((sum, s) => sum + s.finalPrice, 0);

    eventData.financialSummary = {
      totalRequestedPrice,
      totalFinalPrice,
      estimatedCost: totalFinalPrice || totalRequestedPrice,
      budgetTotal: eventData.budget?.total || 0,
      budgetSpent: eventData.budget?.spent || 0,
      budgetRemaining:
        (eventData.budget?.total || 0) -
        (totalFinalPrice || totalRequestedPrice),
      budgetUtilization: eventData.budget?.total
        ? (
            ((totalFinalPrice || totalRequestedPrice) /
              eventData.budget.total) *
            100
          ).toFixed(2)
        : 0,
    };

    // Add location details with full address
    eventData.locationDetails = {
      fullAddress: eventData.location?.address || "",
      city: eventData.location?.city || "",
      coordinates: eventData.location?.coordinates || null,
      hasCoordinates: !!(
        eventData.location?.coordinates?.lat &&
        eventData.location?.coordinates?.lng
      ),
    };

    // Add engagement metrics
    eventData.engagement = {
      views: eventData.views || 0,
      likes: (eventData.likes || []).length,
      interestedCount: eventData.analytics?.supplierRequests || 0,
    };

    // Get recommended events (same category, same city, future events, excluding current event)
    const recommendedEvents = await Event.find({
      _id: { $ne: event._id },
      category: event.category,
      "location.city": event.location?.city,
      isPublic: true,
      status: "approved",
      endDate: { $gte: new Date() },
      startDate: { $gte: new Date() },
    })
      .populate("producerId", "name companyName profileImage")
      .select(
        "name description image startDate endDate location category ticketInfo views featured"
      )
      .sort({ startDate: 1, featured: -1 })
      .limit(5);

    eventData.recommendedEvents = recommendedEvents;

    res.json({
      success: true,
      data: eventData,
      message: "Event details retrieved successfully",
    });
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching event",
      error: error.message,
    });
  }
});

// @desc    Get all events for a specific supplier
// @route   GET /api/events/supplier/:supplierId
// @access  Private (Supplier only)
router.get("/supplier/:supplierId", protect, async (req, res) => {
  try {
    const { supplierId } = req.params;
    const {
      page = 1,
      limit = 10,
      status, // Event status
      supplierStatus, // Supplier status in event
      category, // Event category filter
      search, // Search term
      city, // City filter
      sortBy = "startDate",
    } = req.query;

    console.log("supplierId--->", supplierId);
    console.log(
      "supplier Data --------->",
      req.user.role,
      req.user._id.toString()
    );
    console.log("Query parameters:", {
      page,
      limit,
      status,
      supplierStatus,
      category,
      search,
      city,
      sortBy,
    });

    // Authorization check - suppliers can only see their own events
    if (
      req.user.role === "supplier" &&
      req.user._id.toString() !== supplierId
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access events for this supplier",
      });
    }

    // Build filter for events
    const filter = {
      "suppliers.supplierId": supplierId,
      // Filter out past events - only show current and future events
      endDate: { $gte: new Date() },
    };

    // Add event status filter
    if (status) {
      filter.status = status;
    }

    // Add category filter
    if (category) {
      filter.category = category;
    }

    // Add city filter (search in location.city)
    if (city) {
      filter["location.city"] = { $regex: city, $options: "i" };
    }

    // Add search filter (search in name, description, location)
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { "location.address": searchRegex },
        { "location.city": searchRegex },
      ];
    }

    console.log("MongoDB filter:", JSON.stringify(filter, null, 2));

    // Find events with filters and full details
    let query = Event.find(filter)
      .populate("producerId", "name companyName profileImage email phone")
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { _id: supplierId },
      })
      .populate(
        "suppliers.serviceId",
        "title description price category subcategories tags availability location experience rating portfolio packages featured"
      )
      .sort({ [sortBy]: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const events = await query.exec();

    console.log(`Found ${events.length} events before filtering`);

    // Filter supplier data to only show current supplier's services
    const filteredEvents = events
      .map((event) => {
        const eventObj = event.toObject();
        eventObj.suppliers = eventObj.suppliers.filter(
          (supplier) =>
            supplier.supplierId &&
            supplier.supplierId._id.toString() === supplierId
        );

        // Filter by supplier status if provided
        if (supplierStatus) {
          eventObj.suppliers = eventObj.suppliers.filter(
            (supplier) => supplier.status === supplierStatus
          );
        }

        // Add event date status indicators
        const now = new Date();
        const eventStartDate = new Date(eventObj.startDate);
        const eventEndDate = new Date(eventObj.endDate);

        eventObj.eventDateStatus = {
          isPastEvent: eventEndDate < now,
          isUpcoming: eventStartDate > now,
          isActive: now >= eventStartDate && now <= eventEndDate,
          hasStarted: eventStartDate <= now,
          hasEnded: eventEndDate < now,
          daysUntilStart: Math.ceil(
            (eventStartDate - now) / (1000 * 60 * 60 * 24)
          ),
          daysUntilEnd: Math.ceil((eventEndDate - now) / (1000 * 60 * 60 * 24)),
        };

        // Add flag to indicate if supplier can modify their status
        // Suppliers can only approve/reject if:
        // 1. Event hasn't started yet (or is currently active)
        // 2. Their current status is 'pending'
        eventObj.suppliers = eventObj.suppliers.map((supplier) => {
          const canModifyStatus =
            !eventObj.eventDateStatus.hasEnded && supplier.status === "pending";

          return {
            ...supplier,
            canModifyStatus,
            canApprove: canModifyStatus,
            canReject: canModifyStatus,
          };
        });

        return eventObj;
      })
      .filter((event) => event.suppliers.length > 0); // Only return events where supplier has services

    console.log(`Returning ${filteredEvents.length} events after filtering`);

    // Get total count with the same filters
    const total = await Event.countDocuments(filter);

    // Calculate summary
    const allSupplierEvents = await Event.find({
      "suppliers.supplierId": supplierId,
    });
    let totalServices = 0;
    let confirmedServices = 0;
    let totalEarnings = 0;

    allSupplierEvents.forEach((event) => {
      event.suppliers.forEach((supplier) => {
        if (supplier.supplierId.toString() === supplierId) {
          totalServices++;
          if (supplier.status === "approved") {
            confirmedServices++;
            totalEarnings +=
              supplier.finalPrice || supplier.requestedPrice || 0;
          }
        }
      });
    });

    res.json({
      success: true,
      data: filteredEvents,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEvents: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      summary: {
        totalServices,
        confirmedServices,
        pendingServices: totalServices - confirmedServices,
        totalEarnings,
      },
    });
  } catch (error) {
    console.error("Get supplier events error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier events",
      error: error.message,
    });
  }
});

// @desc    Update event created by producer
// @route   PUT /api/events/:id
// @access  Private (Producer only - own events)
router.put("/:id", protect, authorize("producer"), async (req, res) => {
  try {
    // Validate input
    console.log("=== UPDATE EVENT DEBUG ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const { error, value } = updateEventSchema.validate(req.body);

    if (error) {
      console.log("Validation error:", error);
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details.map((detail) => detail.message),
      });
    }

    console.log("Validated value:", JSON.stringify(value, null, 2));

    // Find the event
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    console.log("Found event:", event._id);

    // Check if the current user is the producer who created this event
    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message:
          "Not authorized to update this event. You can only update events you created.",
      });
    }

    // Validate suppliers and services if being updated (same logic as create endpoint)
    if (value.suppliers && value.suppliers.length > 0) {
      console.log("Validating suppliers...");
      const supplierIds = value.suppliers.map((s) => s.supplierId);
      const serviceIds = value.suppliers.flatMap((s) =>
        s.services ? s.services.map((srv) => srv.serviceId) : [s.serviceId]
      );

      console.log("Supplier IDs:", supplierIds);
      console.log("Service IDs:", serviceIds);

      // Check if all suppliers exist and are verified
      const suppliers = await User.find({
        _id: { $in: supplierIds },
        role: "supplier",
        isVerified: true,
        isActive: true,
      });

      console.log(
        `Found ${suppliers.length} suppliers out of ${supplierIds.length}`
      );

      if (suppliers.length !== supplierIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more suppliers not found or not verified",
        });
      }

      // Check if all services exist and belong to the respective suppliers
      const services = await Service.find({ _id: { $in: serviceIds } });
      console.log(
        `Found ${services.length} services out of ${serviceIds.length}`
      );

      // if (services.length !== serviceIds.length) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'One or more services not found'
      //   });
      // }

      // Validate that each service belongs to the correct supplier
      for (const supplierData of value.suppliers) {
        const supplierServices = services.filter(
          (s) => s.supplierId.toString() === supplierData.supplierId
        );

        const requestedServiceIds = supplierData.services
          ? supplierData.services.map((s) => s.serviceId)
          : [supplierData.serviceId];
        const availableServiceIds = supplierServices.map((s) =>
          s._id.toString()
        );

        const invalidServices = requestedServiceIds.filter(
          (id) => !availableServiceIds.includes(id)
        );

        if (invalidServices.length > 0) {
          console.log("Invalid services found:", invalidServices);
          return res.status(400).json({
            success: false,
            message: `Services ${invalidServices.join(
              ", "
            )} do not belong to supplier ${supplierData.supplierId}`,
          });
        }
      }

      // Note: We allow package replacement now
      // If a supplier-service combination exists with a different package,
      // the addSupplierWithDetails method will automatically replace it
      console.log("Package replacement is allowed. Proceeding with update...");
    }

    // Transform suppliers data for the schema with package information (same as create endpoint)
    console.log("Transforming suppliers data...");
    const transformedSuppliers = value.suppliers
      ? value.suppliers.flatMap((supplier) =>
          supplier.services
            ? supplier.services.map((service) => {
                console.log(
                  "Processing service:",
                  JSON.stringify(service, null, 2)
                );
                return {
                  supplierId: supplier.supplierId,
                  serviceId: service.serviceId,
                  selectedPackageId: service.selectedPackageId,
                  packageDetails: service.packageDetails,
                  requestedPrice: service.requestedPrice,
                  notes: service.notes,
                  priority: service.priority,
                  status: "pending",
                };
              })
            : [
                {
                  supplierId: supplier.supplierId,
                  serviceId: supplier.serviceId,
                  selectedPackageId: supplier.selectedPackageId,
                  packageDetails: supplier.packageDetails,
                  requestedPrice: supplier.requestedPrice,
                  notes: supplier.notes,
                  priority: supplier.priority,
                  status: "pending",
                },
              ]
        )
      : [];

    console.log(
      "Transformed suppliers:",
      JSON.stringify(transformedSuppliers, null, 2)
    );

    // Prepare update data (exclude suppliers for now)
    const updateData = { ...value };
    delete updateData.suppliers;

    console.log(
      "Update data (without suppliers):",
      JSON.stringify(updateData, null, 2)
    );

    // Handle password update explicitly since it has select: false
    if (value.password) {
      console.log("Password update detected");
      event.password = value.password; // Will be hashed by pre-save middleware
    }

    // If ticketInfo is not provided, set default values to satisfy model requirements
    if (!updateData.ticketInfo && value.ticketInfo === undefined) {
      // Don't override existing ticketInfo if not provided in update
    } else if (updateData.ticketInfo) {
      // Ensure all required fields are present
      updateData.ticketInfo = {
        availableTickets: updateData.ticketInfo.availableTickets || 0,
        soldTickets: updateData.ticketInfo.soldTickets || 0,
        reservedTickets: updateData.ticketInfo.reservedTickets || 0,
        priceRange: updateData.ticketInfo.priceRange || { min: 0, max: 0 },
        isFree:
          updateData.ticketInfo.isFree !== undefined
            ? updateData.ticketInfo.isFree
            : true,
        ...updateData.ticketInfo,
      };
    }

    // Extract tickets array if provided for update
    const ticketsToUpdate = value.tickets || [];
    delete updateData.tickets; // Remove tickets array temporarily

    // Update the event basic fields
    console.log("Updating event basic fields...");

    // Apply updates to the event object
    Object.assign(event, updateData);

    // Save the event (this will trigger pre-save middleware for password hashing)
    const updatedEvent = await event.save();

    console.log("Event basic fields updated successfully");

    // Handle ticket updates if provided
    if (ticketsToUpdate.length > 0) {
      console.log(`Updating/Creating ${ticketsToUpdate.length} tickets...`);

      // Delete existing tickets for this event
      await Ticket.deleteMany({ eventId: req.params.id });
      console.log("Deleted existing tickets");

      // Create new ticket documents
      const ticketDocuments = ticketsToUpdate.map((ticket) => {
        // Handle both simplified and nested formats
        const priceAmount =
          typeof ticket.price === "number" ? ticket.price : ticket.price.amount;
        const currency =
          ticket.currency ||
          (typeof ticket.price === "object" ? ticket.price.currency : null) ||
          "ILS";
        const quantity =
          typeof ticket.quantity === "number"
            ? ticket.quantity
            : ticket.quantity.total;

        return {
          eventId: updatedEvent._id,
          eventName: updatedEvent.name,
          title: ticket.title,
          description: ticket.description || "",
          type: ticket.type,
          price: {
            amount: priceAmount,
            currency: currency,
          },
          quantity: {
            total: quantity,
            available: quantity,
            sold: 0,
            reserved: 0,
          },
          status: "active",
          validity: {
            startDate: updatedEvent.startDate,
            endDate: updatedEvent.endDate,
            isActive: true,
          },
          sales: {
            startDate: updatedEvent.startDate,
            endDate: updatedEvent.endDate,
          },
          restrictions: {
            maxPerPerson: 10,
          },
          refundPolicy: {
            allowed: true,
            deadline: 7,
            fee: 0,
          },
        };
      });

      const createdTickets = await Ticket.insertMany(ticketDocuments);
      console.log(
        `Created ${createdTickets.length} new tickets for event ${updatedEvent._id}`
      );

      // Update event's ticketInfo based on created tickets
      const totalTickets = ticketsToUpdate.reduce((sum, t) => {
        const qty =
          typeof t.quantity === "number" ? t.quantity : t.quantity.total;
        return sum + qty;
      }, 0);
      const prices = ticketsToUpdate.map((t) =>
        typeof t.price === "number" ? t.price : t.price.amount
      );

      updatedEvent.ticketInfo = {
        availableTickets: totalTickets,
        soldTickets: 0,
        reservedTickets: 0,
        priceRange: {
          min: Math.min(...prices),
          max: Math.max(...prices),
        },
        isFree: Math.min(...prices) === 0,
      };

      await updatedEvent.save();
      console.log(
        `Updated event ticketInfo: ${totalTickets} total tickets, price range: ${Math.min(
          ...prices
        )} - ${Math.max(...prices)}`
      );
    }

    // Handle suppliers update if provided
    if (transformedSuppliers.length > 0) {
      console.log(`Adding ${transformedSuppliers.length} new suppliers...`);
      console.log("Current suppliers count:", updatedEvent.suppliers.length);

      // DON'T clear existing suppliers - just add new ones
      // This preserves existing supplier-service combinations

      // Add new suppliers using the model method with package information
      for (const supplier of transformedSuppliers) {
        try {
          console.log(
            `Adding supplier ${supplier.supplierId} with service ${supplier.serviceId}`
          );
          console.log(
            "Supplier details:",
            JSON.stringify(
              {
                requestedPrice: supplier.requestedPrice,
                notes: supplier.notes,
                priority: supplier.priority,
                selectedPackageId: supplier.selectedPackageId,
                packageDetails: supplier.packageDetails,
              },
              null,
              2
            )
          );

          await updatedEvent.addSupplierWithDetails(
            supplier.supplierId,
            supplier.serviceId,
            {
              requestedPrice: supplier.requestedPrice,
              notes: supplier.notes,
              priority: supplier.priority,
              selectedPackageId: supplier.selectedPackageId,
              packageDetails: supplier.packageDetails,
            }
          );
          console.log(`Successfully added supplier ${supplier.supplierId}`);
        } catch (err) {
          // If supplier already exists, it's okay - just skip
          if (err.message.includes("already added")) {
            console.log(
              `Supplier ${supplier.supplierId} with service ${supplier.serviceId} already exists, skipping...`
            );
          } else {
            console.error(
              `Failed to add supplier ${supplier.supplierId} with service ${supplier.serviceId}:`,
              err.message
            );
            console.error("Error stack:", err.stack);
          }
          // Continue with other suppliers even if one fails
        }
      }

      console.log(
        "Finished adding suppliers. Total suppliers now:",
        updatedEvent.suppliers.length
      );
    } else {
      console.log("No new suppliers to add");
    }

    // Populate and return the updated event with full details
    console.log("Populating event data...");
    const populatedEvent = await Event.findById(req.params.id)
      .populate("producerId", "name companyName profileImage email phone")
      .populate({
        path: "suppliers.supplierId",
        select: "name companyName profileImage email phone supplierDetails",
        match: { isActive: true },
      })
      .populate({
        path: "suppliers.serviceId",
        select:
          "title description price category subcategories tags availability location experience rating portfolio packages featured",
      })
      .populate("tickets");

    console.log(
      "Final populated event suppliers count:",
      populatedEvent.suppliers.length
    );
    console.log("=== UPDATE EVENT COMPLETE ===");

    res.json({
      success: true,
      data: populatedEvent,
      message: "Event updated successfully with suppliers and services",
    });
  } catch (error) {
    console.error("Update event error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Error updating event",
      error: error.message,
    });
  }
});

// @desc    Delete event created by producer
// @route   DELETE /api/events/:id
// @access  Private (Producer only - own events)
router.delete("/:id", protect, authorize("producer"), async (req, res) => {
  try {
    // Find the event
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if the current user is the producer who created this event
    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message:
          "Not authorized to delete this event. You can only delete events you created.",
      });
    }

    // Check if event has any approved suppliers (optional business rule)
    const approvedSuppliers = event.suppliers.filter(
      (s) => s.status === "approved"
    );
    // if (approvedSuppliers.length > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Cannot delete event with approved suppliers. Please cancel supplier agreements first.',
    //     details: {
    //       approvedSuppliersCount: approvedSuppliers.length
    //     }
    //   });
    // }

    // Delete the event
    await Event.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting event",
      error: error.message,
    });
  }
});

// @desc    Get orders for supplier
// @route   GET /api/events/orders
// @access  Private (Supplier only)
router.get("/orders", protect, requireApprovedSupplier, async (req, res) => {
  try {
    const supplierId = req.user._id; // 👈 current logged-in supplier ID

    console.log("supplierId--->", supplierId);

    const orders = await Order.find({ supplierId })
      .populate("eventId", "name startDate endDate location")
      .populate("producerId", "name companyName profileImage")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

// @desc    Verify password for private event
// @route   POST /api/events/:id/verify-password
// @access  Public
router.post("/:id/verify-password", async (req, res) => {
  try {
    // Validate input
    const { error, value } = verifyPasswordSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.details.map((detail) => detail.message),
      });
    }

    const { password } = value;

    // Find the event and explicitly select the password field
    const event = await Event.findById(req.params.id).select("+password");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if event is private
    if (event.isPublic) {
      return res.status(400).json({
        success: false,
        message: "This event is public and does not require a password",
      });
    }

    // Check if event has a password set
    if (!event.password) {
      return res.status(400).json({
        success: false,
        message: "This private event does not have a password set",
      });
    }

    // Verify the password
    const isPasswordCorrect = await event.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }

    // Password is correct - return success with basic event info
    res.json({
      success: true,
      message: "Password verified successfully",
      data: {
        eventId: event._id,
        eventName: event.name,
        isPrivate: !event.isPublic,
        accessGranted: true,
      },
    });
  } catch (error) {
    console.error("Verify password error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying password",
      error: error.message,
    });
  }
});

module.exports = router;
