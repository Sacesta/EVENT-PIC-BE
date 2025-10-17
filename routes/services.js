const express = require("express");
const Joi = require("joi");
const Service = require("../models/Service");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  protect,
  authorize,
  requireApprovedSupplier,
} = require("../middleware/auth");

// Create uploads folder if it doesn't exist
const uploadPath = path.join(__dirname, '../uploads/supplier/packages');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const router = express.Router();

// Validation schemas
const createServiceSchema = Joi.object({
  title: Joi.string().min(2).max(200).optional(),
  description: Joi.string().min(10).max(2000).required(),
  category: Joi.string()
    .valid(
      'photography',          // צלמים
      'catering',             // קייטרינג
      'bar',                  // בר
      'musicians',            // אומנים
      'scenery',              // scenery / תפאורה
      'sounds_lights',        // הגברה ותאורה
      'transportation',       // שירותי הסעות
      'security',             // אבטחה
      'first_aid',            // עזרה ראשונה
      'insurance',            // ביטוח
      'location',             // מקומות להשכרה
      'dj'                    // DJ
    )
    .required(),
  subcategories: Joi.array().items(Joi.string()).optional(),
  price: Joi.object({
    amount: Joi.number().min(0).required(),
    currency: Joi.string().valid("ILS", "USD", "EUR").default("ILS"),
    pricingType: Joi.string()
      .valid(
        "fixed",
        "per_hour",
        "per_person",
        "per_day",
        "per_project",
        "negotiable"
      )
      .default("fixed"),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
  }).required(),
  packages: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().allow('').optional(),
        price: Joi.number().min(0).required(),
        features: Joi.array().items(Joi.string()).optional(),
        duration: Joi.number().min(0).optional(),
        isPopular: Joi.boolean().default(false),
      })
    )
    .optional(),
  image: Joi.string().optional(),
  portfolio: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().optional(),
        description: Joi.string().optional(),
        image: Joi.string().optional(),
        eventType: Joi.string().optional(),
        date: Joi.date().optional(),
      })
    )
    .optional(),
  availability: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    workingHours: Joi.object({
      monday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      tuesday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      wednesday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      thursday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      friday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      saturday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
      sunday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean().default(true),
      }).optional(),
    }).optional(),
    leadTime: Joi.number().min(0).default(1).optional(),
  }).optional(),
  location: Joi.object({
    city: Joi.string().required(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
    }).optional(),
    serviceRadius: Joi.number().min(0).default(50).optional(),
  }).required(),
  experience: Joi.string()
    .valid("beginner", "intermediate", "expert")
    .default("intermediate")
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().default(false).optional(),
});

const updateServiceSchema = Joi.object({
  title: Joi.string().min(2).max(200).optional(),
  description: Joi.string().min(10).max(2000).optional(),
  category: Joi.string()
    .valid(
      'photography',          // צלמים
      'catering',             // קייטרינג
      'bar',                  // בר
      'musicians',            // אומנים
      'scenery',              // scenery / תפאורה
      'sounds_lights',        // הגברה ותאורה
      'transportation',       // שירותי הסעות
      'security',             // אבטחה
      'first_aid',            // עזרה ראשונה
      'insurance',            // ביטוח
      'location',             // מקומות להשכרה
      'dj'                    // DJ
    )
    .optional(),
  subcategories: Joi.array().items(Joi.string()).optional(),
  price: Joi.object({
    amount: Joi.number().min(0).optional(),
    currency: Joi.string().valid("ILS", "USD", "EUR").optional(),
    pricingType: Joi.string()
      .valid(
        "fixed",
        "per_hour",
        "per_person",
        "per_day",
        "per_project",
        "negotiable"
      )
      .optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
  }).optional(),
  packages: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().optional(),
        description: Joi.string().allow('').optional(),
        price: Joi.number().min(0).optional(),
        features: Joi.array().items(Joi.string()).optional(),
        duration: Joi.number().min(0).optional(),
        isPopular: Joi.boolean().optional(),
      })
    )
    .optional(),
  image: Joi.string().optional(),
  portfolio: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().optional(),
        description: Joi.string().optional(),
        image: Joi.string().optional(),
        eventType: Joi.string().optional(),
        date: Joi.date().optional(),
      })
    )
    .optional(),
  availability: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    workingHours: Joi.object({
      monday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      tuesday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      wednesday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      thursday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      friday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      saturday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
      sunday: Joi.object({
        start: Joi.string(),
        end: Joi.string(),
        available: Joi.boolean(),
      }).optional(),
    }).optional(),
    leadTime: Joi.number().min(0).optional(),
  }).optional(),
  location: Joi.object({
    city: Joi.string().optional(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
    }).optional(),
    serviceRadius: Joi.number().min(0).optional(),
  }).optional(),
  experience: Joi.string()
    .valid("beginner", "intermediate", "expert")
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().optional(),
  available: Joi.boolean().optional(),
});

// Package validation schema
const packageSchema = Joi.object({
  _id: Joi.any().strip(), // Strip _id field from validation to allow frontend to send complete package object
  name: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  price: Joi.number().min(0).required(),
  features: Joi.array().items(Joi.string()).optional(),
  duration: Joi.number().min(0).optional(),
  isPopular: Joi.boolean().default(false).optional(),
});

// @desc    Create new service
// @route   POST /api/services
// @access  Private (Approved suppliers only)
router.post(
  "/",
  protect,
  authorize("supplier"),
  requireApprovedSupplier,
  async (req, res) => {
    try {
      // Validate input
      console.log("body--->", req.body);
      const { error, value } = createServiceSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Create service with supplier ID
      const service = await Service.create({
        ...value,
        supplierId: req.user._id,
      });

      res.status(201).json({
        success: true,
        data: service,
      });
    } catch (error) {
      console.error("Create service error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating service",
        error: error.message,
      });
    }
  }
);

// @desc    Get all services (with filtering)
// @route   GET /api/services
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      city,
      maxPrice,
      minPrice,
      isAvailable = true,
      search,
      tags,
    } = req.query;

    // Build filter object
    const filter = { status: "active", available: true };

    if (category) filter.category = category;
    if (city) filter["location.city"] = new RegExp(city, "i");

    if (minPrice || maxPrice) {
      filter["price.amount"] = {};
      if (minPrice) filter["price.amount"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["price.amount"].$lte = parseFloat(maxPrice);
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    if (tags) {
      const tagArray = tags.split(",").map((tag) => tag.trim());
      filter.tags = { $in: tagArray };
    }

    // Execute query with pagination
    const services = await Service.find(filter)
      .populate(
        "supplierId",
        "name supplierDetails.companyName profileImage supplierDetails.rating"
      )
      .sort({ "rating.average": -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Service.countDocuments(filter);

    res.json({
      success: true,
      data: services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching services",
      error: error.message,
    });
  }
});

// @desc    Get services with complete supplier information and packages
// @route   GET /api/services/with-suppliers
// @access  Public
router.get("/with-suppliers", async (req, res) => {
  try {
    const {
      category,
      city,
      maxPrice,
      minPrice,
      search,
      limit = 50,
      page = 1,
      minRating = 0,
    } = req.query;

    console.log("Search filters applied:", {
      searchTerm: search,
      category,
      city,
      priceRange: { min: minPrice, max: maxPrice },
      minRating,
      page,
      limit,
    });

    // -------------------------------
    // 1. Build service filter
    // -------------------------------
    const serviceFilter = {
      available: true,
      status: "active",
    };

    // Category filter
    if (category) {
      const categories = category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (categories.length === 1) serviceFilter.category = categories[0];
      else if (categories.length > 1)
        serviceFilter.category = { $in: categories };
    }

    // Price filter
    if (minPrice || maxPrice) {
      serviceFilter["price.amount"] = {};
      if (minPrice) serviceFilter["price.amount"].$gte = parseFloat(minPrice);
      if (maxPrice) serviceFilter["price.amount"].$lte = parseFloat(maxPrice);
    }

    // Rating filter
    if (minRating)
      serviceFilter["rating.average"] = { $gte: parseFloat(minRating) };

    // City filter for services
    if (city && city.trim() !== "") {
      const cityRegex = new RegExp(city.trim(), "i");
      serviceFilter["location.city"] = cityRegex;
    }

    // -------------------------------
    // 2. Build supplier filter
    // -------------------------------
    const supplierMatch = {
      isActive: true,
      isVerified: true,
      role: "supplier",
    };

    // -------------------------------
    // Search term will also filter suppliers after population
    // -------------------------------
    const searchRegex = search ? new RegExp(search, "i") : null;

    // -------------------------------
    // 3. Query DB with populate
    // -------------------------------
    let services = await Service.find(serviceFilter)
      .populate({
        path: "supplierId",
        select:
          "name email phone profileImage supplierDetails producerDetails isVerified isActive createdAt",
        match: supplierMatch,
      })
      .sort({
        "rating.average": -1,
        "price.amount": 1,
        createdAt: -1,
      })
      .limit(parseInt(limit) * 2) // Get more initially to account for deduplication
      .skip((parseInt(page) - 1) * parseInt(limit));

    // -------------------------------
    // Filter out services with no supplier
    // -------------------------------
    services = services.filter((s) => s.supplierId);

    // Apply supplier name search only
    if (searchRegex) {
      services = services.filter((s) => {
        const supplier = s.supplierId;
        if (!supplier) return false;

        // Search only supplier name
        return supplier.name && searchRegex.test(supplier.name);
      });
    }

    // -------------------------------
    // Remove duplicate suppliers (keep the best service per supplier)
    // -------------------------------
    const supplierServiceMap = new Map();
    services.forEach((service) => {
      const supplierId = service.supplierId._id.toString();
      const existingService = supplierServiceMap.get(supplierId);

      if (!existingService) {
        supplierServiceMap.set(supplierId, service);
      } else {
        // Priority: Higher rating > Featured > Lower price > Newer
        const current = {
          rating: service.rating?.average || 0,
          featured: service.featured || false,
          price: service.price?.amount || Infinity,
          created: new Date(service.createdAt),
        };

        const existing = {
          rating: existingService.rating?.average || 0,
          featured: existingService.featured || false,
          price: existingService.price?.amount || Infinity,
          created: new Date(existingService.createdAt),
        };

        // Keep current if it's better
        if (
          current.rating > existing.rating ||
          (current.rating === existing.rating &&
            current.featured &&
            !existing.featured) ||
          (current.rating === existing.rating &&
            current.featured === existing.featured &&
            current.price < existing.price) ||
          (current.rating === existing.rating &&
            current.featured === existing.featured &&
            current.price === existing.price &&
            current.created > existing.created)
        ) {
          supplierServiceMap.set(supplierId, service);
        }
      }
    });

    // Replace services array with deduplicated results
    services = Array.from(supplierServiceMap.values());

    // Apply pagination after deduplication
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedServices = services.slice(startIndex, endIndex);

    console.log("Results after processing:", {
      totalFound: services.length,
      afterPagination: paginatedServices.length,
      duplicatesRemoved: true,
    });

    // -------------------------------
    // 4. Format response
    // -------------------------------
    const formattedServices = paginatedServices.map((service) => ({
      serviceId: service._id,
      title: service.title,
      description: service.description,
      category: service.category,
      subcategories: service.subcategories || [],
      tags: service.tags || [],
      price: service.price,
      packages: service.packages || [],
      rating: service.rating,
      location: service.location,
      availability: service.availability,
      image: service.imageUrl,
      portfolio: service.portfolio || [],
      available: service.available,
      featured: service.featured,
      views: service.views,
      experience: service.experience,
      supplier: service.supplierId
        ? {
            supplierId: service.supplierId._id,
            name: service.supplierId.name,
            email: service.supplierId.email,
            phone: service.supplierId.phone,
            profileImage: service.supplierId.profileImageUrl,
            isVerified: service.supplierId.isVerified,
            memberSince: service.supplierId.createdAt,
            ...service.supplierId.supplierDetails,
            // Include producer details if available (for users with both roles)
            ...(service.supplierId.producerDetails && {
              producerDetails: service.supplierId.producerDetails,
            }),
          }
        : null,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    }));

    // -------------------------------
    // 5. Count for pagination using aggregation (accounting for deduplication)
    // -------------------------------
    const countPipeline = [
      { $match: serviceFilter },
      {
        $lookup: {
          from: "users",
          localField: "supplierId",
          foreignField: "_id",
          as: "supplier",
          pipeline: [{ $match: supplierMatch }],
        },
      },
      { $match: { "supplier.0": { $exists: true } } },
      // Group by supplierId to remove duplicates
      {
        $group: {
          _id: "$supplierId",
          bestService: {
            $first: {
              $mergeObjects: [
                "$$ROOT",
                {
                  score: {
                    $add: [
                      { $multiply: [{ $ifNull: ["$rating.average", 0] }, 100] },
                      { $cond: [{ $eq: ["$featured", true] }, 50, 0] },
                      {
                        $subtract: [1000, { $ifNull: ["$price.amount", 1000] }],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      { $count: "total" },
    ];

    let total = 0;
    try {
      const countResult = await Service.aggregate(countPipeline);
      total = countResult.length ? countResult[0].total : 0;
    } catch (countError) {
      console.error("Count aggregation error:", countError);
      // Fallback to simple count
      total = services.length;
    }

    res.json({
      success: true,
      message: "Services with suppliers retrieved successfully",
      data: formattedServices,
      count: formattedServices.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) * parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      },
      filters: {
        category,
        city,
        maxPrice,
        minPrice,
        search,
        minRating,
      },
      meta: {
        searchApplied: !!search,
        duplicatesRemoved: true,
        totalBeforeDeduplication: services.length,
        processingTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get services with suppliers error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching services with suppliers",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// @desc    Get single service
// @route   GET /api/services/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate(
      "supplierId",
      "name supplierDetails.companyName profileImage supplierDetails.rating supplierDetails.experience"
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Increment views
    service.views += 1;
    await service.save();

    res.json({
      success: true,
      data: service,
    });
  } catch (error) {
    console.error("Get service error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching service",
      error: error.message,
    });
  }
});

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private (Approved service supplier only)
router.put("/:id", protect, requireApprovedSupplier, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateServiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.details.map((detail) => detail.message),
      });
    }

    // Check if service exists and user owns it
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (service.supplierId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this service",
      });
    }

    // Update service
    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true }
    ).populate("supplierId", "name companyName");

    res.json({
      success: true,
      data: updatedService,
    });
  } catch (error) {
    console.error("Update service error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating service",
      error: error.message,
    });
  }
});

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private (Approved service supplier only)
router.delete("/:id", protect, requireApprovedSupplier, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (service.supplierId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this service",
      });
    }

    await Service.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting service",
      error: error.message,
    });
  }
});

// @desc    Get supplier's services (including pending suppliers)
// @route   GET /api/services/supplier/me
// @access  Private (All suppliers - pending and approved)
router.get(
  "/supplier/me",
  protect,
  authorize("supplier"),
  async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;

      console.log("supplier Id -------->", req.user._id);

      const filter = { supplierId: req.user._id };
      
      // Allow filtering by status (active, pending_approval, inactive, suspended)
      if (status) {
        filter.status = status;
      }

      const services = await Service.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Service.countDocuments(filter);

      // Get counts by status
      const statusCounts = await Service.aggregate([
        { $match: { supplierId: req.user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      const counts = {
        total: total,
        active: 0,
        pending_approval: 0,
        inactive: 0,
        suspended: 0
      };

      statusCounts.forEach(item => {
        counts[item._id] = item.count;
      });

      res.json({
        success: true,
        data: services,
        counts: counts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalServices: total,
        },
        supplierStatus: {
          verificationStatus: req.user.verificationStatus,
          isVerified: req.user.isVerified,
          canEditServices: true, // All suppliers can edit their services
          canPublishServices: req.user.verificationStatus === 'approved' && req.user.isVerified
        }
      });
    } catch (error) {
      console.error("Get supplier services error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching supplier services",
        error: error.message,
      });
    }
  }
);

// @desc    Get services by category
// @route   GET /api/services/category/:category
// @access  Public
router.get("/category/:category", async (req, res) => {
  try {
    const { page = 1, limit = 10, city, maxPrice } = req.query;

    const filter = {
      category: req.params.category,
      status: "active",
      available: true,
    };

    if (city) filter["location.city"] = new RegExp(city, "i");
    if (maxPrice) filter["price.amount"] = { $lte: parseFloat(maxPrice) };

    const services = await Service.find(filter)
      .populate(
        "supplierId",
        "name supplierDetails.companyName profileImage supplierDetails.rating"
      )
      .sort({ "rating.average": -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Service.countDocuments(filter);

    res.json({
      success: true,
      data: services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
      },
    });
  } catch (error) {
    console.error("Get services by category error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching services by category",
      error: error.message,
    });
  }
});

// @desc    Toggle service availability
// @route   PUT /api/services/:id/availability
// @access  Private (Approved service supplier only)
router.put(
  "/:id/availability",
  protect,
  requireApprovedSupplier,
  async (req, res) => {
    try {
      const { isAvailable } = req.body;

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isAvailable must be a boolean value",
        });
      }

      const service = await Service.findById(req.params.id);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      if (service.supplierId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this service",
        });
      }

      service.available = isAvailable;
      await service.save();

      res.json({
        success: true,
        message: `Service ${
          isAvailable ? "activated" : "deactivated"
        } successfully`,
        data: service,
      });
    } catch (error) {
      console.error("Toggle service availability error:", error);
      res.status(500).json({
        success: false,
        message: "Error toggling service availability",
        error: error.message,
      });
    }
  }
);

// @desc    Add service review
// @route   POST /api/services/:id/reviews
// @access  Private
router.post("/:id/reviews", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Check if user already reviewed this service
    const existingReview = service.rating.reviews.find(
      (review) => review.userId.toString() === req.user._id.toString()
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this service",
      });
    }

    // Add review
    service.rating.reviews.push({
      userId: req.user._id,
      rating,
      comment,
      createdAt: new Date(),
    });

    await service.save();

    res.json({
      success: true,
      message: "Review added successfully",
      data: {
        rating: service.rating.average,
        totalReviews: service.rating.reviews.length,
      },
    });
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding review",
      error: error.message,
    });
  }
});

// @desc    Get all services with packages (detailed view)
// @route   GET /api/services/with-packages
// @access  Public
router.get("/with-packages", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      city,
      maxPrice,
      minPrice,
      search,
      tags,
    } = req.query;

    // Build filter object
    const filter = { status: "active", available: true };

    if (category) filter.category = category;
    if (city) filter["location.city"] = new RegExp(city, "i");

    if (minPrice || maxPrice) {
      filter["price.amount"] = {};
      if (minPrice) filter["price.amount"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["price.amount"].$lte = parseFloat(maxPrice);
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    if (tags) {
      const tagArray = tags.split(",").map((tag) => tag.trim());
      filter.tags = { $in: tagArray };
    }

    // Execute query with pagination
    const services = await Service.find(filter)
      .populate(
        "supplierId",
        "name supplierDetails.companyName profileImage supplierDetails.rating supplierDetails.experience phone"
      )
      .sort({ "rating.average": -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Service.countDocuments(filter);

    // Format response with detailed package information
    const formattedServices = services.map((service) => ({
      id: service._id,
      title: service.title,
      description: service.description,
      category: service.category,
      subcategories: service.subcategories,
      image: service.imageUrl,
      price: service.price,
      packages: service.packages,
      portfolio: service.portfolioUrls,
      availability: service.availability,
      location: service.location,
      experience: service.experience,
      rating: {
        average: service.rating.average,
        count: service.rating.count,
        totalReviews: service.rating.reviews.length,
      },
      tags: service.tags,
      views: service.views,
      featured: service.featured,
      supplier: service.supplierId,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    }));

    res.json({
      success: true,
      data: formattedServices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get services with packages error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching services with packages",
      error: error.message,
    });
  }
});

// @desc    Get packages for a specific service
// @route   GET /api/services/:id/packages
// @access  Public
router.get("/:id/packages", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate(
      "supplierId",
      "name supplierDetails.companyName profileImage supplierDetails.rating"
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.json({
      success: true,
      data: {
        serviceId: service._id,
        serviceTitle: service.title,
        category: service.category,
        packages: service.packages,
        supplier: service.supplierId,
      },
    });
  } catch (error) {
    console.error("Get service packages error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching service packages",
      error: error.message,
    });
  }
});

// @desc    Add package to existing service
// @route   POST /api/services/:id/packages
// @access  Private (Approved service supplier only)
router.post(
  "/:id/packages",
  protect,
  requireApprovedSupplier,
  upload.single('image'),
  async (req, res) => {
    try {
      // Validate package input
      console.log("body check------>", req.body);
      const { error, value } = packageSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Check if service exists and user owns it
      const service = await Service.findById(req.params.id);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      if (service.supplierId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this service",
        });
      }

        // Save image path if uploaded
      if (req.file) {
        value.imageUrl = `/uploads/supplier/packages/${req.file.filename}`;
      }

      // Add package to service
      service.packages.push(value);
      await service.save();

      res.status(201).json({
        success: true,
        message: "Package added successfully",
        data: {
          serviceId: service._id,
          packages: service.packages,
        },
      });
    } catch (error) {
      console.error("Add package error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding package",
        error: error.message,
      });
    }
  }
);

// @desc    Update package in service
// @route   PUT /api/services/:id/packages/:packageId
// @access  Private (Approved service supplier only)
router.put(
  "/:id/packages/:packageId",
  protect,
  requireApprovedSupplier,
   upload.single('image'),
  async (req, res) => {
    try {
      // Validate package input
      console.log("body------>", req.body);
      const { error, value } = packageSchema.validate(req.body);

      console.log("error : ",error)
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details.map((detail) => detail.message),
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Check if service exists and user owns it
      const service = await Service.findById(req.params.id);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      if (service.supplierId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this service",
        });
      }

      // Find and update package
      const packageIndex = service.packages.findIndex(
        (pkg) => pkg._id.toString() === req.params.packageId
      );

      if (packageIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Package not found",
        });
      }

      // Update package
      const updatedPackage = {
        ...service.packages[packageIndex].toObject(),
        ...value,
      };

      // Save new image if uploaded
      if (req.file) {
        updatedPackage.imageUrl = `/uploads/packages/${req.file.filename}`;
      }

      service.packages[packageIndex] = updatedPackage;

      await service.save();

      res.json({
        success: true,
        message: "Package updated successfully",
        data: {
          serviceId: service._id,
          package:updatedPackage,
        },
      });
    } catch (error) {
      console.error("Update package error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating package",
        error: error.message,
      });
    }
  }
);

// @desc    Delete package from service
// @route   DELETE /api/services/:id/packages/:packageId
// @access  Private (Approved service supplier only)
router.delete(
  "/:id/packages/:packageId",
  protect,
  requireApprovedSupplier,
  async (req, res) => {
    try {
      // Check if service exists and user owns it
      const service = await Service.findById(req.params.id);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      if (service.supplierId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to modify this service",
        });
      }

      // Find and remove package
      const packageIndex = service.packages.findIndex(
        (pkg) => pkg._id.toString() === req.params.packageId
      );

      if (packageIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Package not found",
        });
      }

      service.packages.splice(packageIndex, 1);
      await service.save();

      res.json({
        success: true,
        message: "Package deleted successfully",
        data: {
          serviceId: service._id,
          remainingPackages: service.packages.length,
        },
      });
    } catch (error) {
      console.error("Delete package error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting package",
        error: error.message,
      });
    }
  }
);

module.exports = router;
