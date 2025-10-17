const express = require("express");
const User = require("../models/User");
const Service = require("../models/Service");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// @desc    Get all suppliers with optional filtering
// @route   GET /api/suppliers
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      category,
      city,
      maxPrice,
      minRating = 0,
      limit = 20,
      page = 1,
      search,
      verified = true,
      active = true,
    } = req.query;

    // Build base filter for suppliers
    const supplierFilter = {
      role: "supplier",
      isActive: active === "true" || active === true,
      isVerified: verified === "true" || verified === true,
    };

    // Add rating filter if provided
    if (minRating) {
      supplierFilter["supplierDetails.rating.average"] = {
        $gte: parseFloat(minRating),
      };
    }

    // Add city filter if provided
    if (city) {
      supplierFilter["supplierDetails.location.city"] = new RegExp(city, "i");
    }

    // Add search filter if provided
    if (search) {
      supplierFilter.$or = [
        { name: new RegExp(search, "i") },
        { "supplierDetails.companyName": new RegExp(search, "i") },
        { "supplierDetails.description": new RegExp(search, "i") },
      ];
    }

    // If category or maxPrice is specified, we need to filter by services
    let supplierIds = null;
    if (category || maxPrice) {
      const serviceFilter = {
        status: "active",
        available: true,
      };

      if (category) serviceFilter.category = category;
      if (maxPrice)
        serviceFilter["price.amount"] = { $lte: parseFloat(maxPrice) };

      const services = await Service.find(serviceFilter).distinct("supplierId");
      supplierIds = services;
      supplierFilter._id = { $in: supplierIds };
    }

    // Execute query with pagination
    const suppliers = await User.find(supplierFilter)
      .select(
        "name email profileImage supplierDetails isVerified isActive createdAt"
      )
      .sort({ "supplierDetails.rating.average": -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(supplierFilter);

    res.json({
      success: true,
      data: suppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) * parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get suppliers error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers",
      error: error.message,
    });
  }
});

router.get("/suppliers-directory", async (req, res) => {
  try {
    const {
      category,
      city,
      minRating = 0,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    // Build filter for services
    const serviceFilter = {
      available: true,
      supplierId: { $exists: true, $ne: null },
    };

    if (category) {
      serviceFilter.category = category;
    }

    if (search) {
      serviceFilter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Get services with their supplier details
    const services = await Service.find(serviceFilter)
      .populate({
        path: "supplierId",
        select:
          "_id name email phone companyName profileImage isActive isVerified memberSince",
        match: {
          isActive: true,
          ...(city && { "location.city": { $regex: city, $options: "i" } }),
        },
      })
      .lean()
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Filter out services where supplier doesn't match criteria
    const filteredServices = services.filter(
      (service) => service.supplierId !== null
    );

    // Group services by supplier
    const suppliersMap = new Map();

    for (const service of filteredServices) {
      const supplierId = service.supplierId._id.toString();

      if (!suppliersMap.has(supplierId)) {
        suppliersMap.set(supplierId, {
          supplierId: service.supplierId._id,
          name: service.supplierId.name,
          email: service.supplierId.email,
          phone: service.supplierId.phone,
          companyName: service.supplierId.companyName,
          profileImage: service.supplierId.profileImage,
          isVerified: service.supplierId.isVerified,
          memberSince: service.supplierId.memberSince,
          rating: {
            average: 0,
            count: 0,
          },
          services: [],
        });
      }

      const supplier = suppliersMap.get(supplierId);

      // Add service with packages
      supplier.services.push({
        serviceId: service._id,
        title: service.title,
        description: service.description,
        category: service.category,
        subcategories: service.subcategories || [],
        tags: service.tags || [],

        // Pricing
        price: {
          amount: service.price?.amount || 0,
          currency: service.price?.currency || "USD",
          pricingType: service.price?.pricingType || "fixed",
          minPrice: service.price?.minPrice,
          maxPrice: service.price?.maxPrice,
        },

        // Packages
        packages: (service.packages || []).map((pkg) => ({
          _id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          price: pkg.price,
          features: pkg.features || [],
          duration: pkg.duration,
          isPopular: pkg.isPopular || false,
        })),

        // Rating
        rating: service.rating
          ? {
              average: service.rating.average || 0,
              count: service.rating.count || 0,
              totalReviews: service.rating.reviews?.length || 0,
            }
          : {
              average: 0,
              count: 0,
              totalReviews: 0,
            },

        // Availability
        availability: {
          startDate: service.availability?.startDate,
          endDate: service.availability?.endDate,
          workingHours: service.availability?.workingHours,
          leadTime: service.availability?.leadTime,
        },

        // Location
        location: {
          city: service.location?.city,
          coordinates: service.location?.coordinates,
          serviceRadius: service.location?.serviceRadius,
        },

        // Media
        image: service.image,
        portfolio: (service.portfolio || []).map((item) => ({
          title: item.title,
          description: item.description,
          image: item.image,
          eventType: item.eventType,
          date: item.date,
        })),

        // Status
        available: service.available !== false,
        featured: service.featured || false,
        views: service.views || 0,
        experience: service.experience,
      });
    }

    // Convert map to array and apply minRating filter
    const suppliersArray = Array.from(suppliersMap.values()).filter(
      (supplier) => supplier.rating.average >= parseFloat(minRating)
    );

    // Get total count for pagination
    const totalCount = await Service.countDocuments(serviceFilter);

    res.status(200).json({
      success: true,
      message: "Suppliers directory retrieved successfully",
      data: suppliersArray,
      count: suppliersArray.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
      filters: {
        category: category || null,
        city: city || null,
        minRating: parseFloat(minRating),
        search: search || null,
      },
    });
  } catch (error) {
    console.error("Error fetching suppliers directory:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers directory",
      error: error.message,
    });
  }
});


// @desc    Get suppliers with their services included
// @route   GET /api/suppliers/with-services
// @access  Public
router.get("/with-services", async (req, res) => {
  try {
    const {
      category,
      city,
      maxPrice,
      minPrice,
      minRating = 0,
      limit = 50,
      page = 1,
      search,
    } = req.query;

    // Build base filter for suppliers
    const supplierFilter = {
      role: "supplier",
      isVerified: true,
      isActive: true,
    };

    // Add rating filter if provided
    if (minRating) {
      supplierFilter["supplierDetails.rating.average"] = {
        $gte: parseFloat(minRating),
      };
    }

    // Add city filter if provided
    if (city) {
      supplierFilter["supplierDetails.location.city"] = new RegExp(city, "i");
    }

    // Add search filter if provided
    if (search) {
      supplierFilter.$or = [
        { name: new RegExp(search, "i") },
        { "supplierDetails.companyName": new RegExp(search, "i") },
        { "supplierDetails.description": new RegExp(search, "i") },
      ];
    }

    // Get suppliers
    const suppliers = await User.find(supplierFilter)
      .select(
        "name email profileImage supplierDetails isVerified isActive createdAt"
      )
      .sort({ "supplierDetails.rating.average": -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Build service filter
    const serviceFilter = {
      status: "active",
      available: true,
      supplierId: { $in: suppliers.map((s) => s._id) },
    };

    if (category) serviceFilter.category = category;
    if (maxPrice)
      serviceFilter["price.amount"] = { $lte: parseFloat(maxPrice) };
    if (minPrice)
      serviceFilter["price.amount"] = {
        ...serviceFilter["price.amount"],
        $gte: parseFloat(minPrice),
      };

    // Get services for these suppliers
    const services = await Service.find(serviceFilter)
      .select(
        "supplierId title description category price packages rating location available"
      )
      .sort({ "rating.average": -1, "price.amount": 1 });

    // Group services by supplier
    const servicesBySupplier = services.reduce((acc, service) => {
      const supplierId = service.supplierId.toString();
      if (!acc[supplierId]) acc[supplierId] = [];
      acc[supplierId].push(service);
      return acc;
    }, {});

    // Filter suppliers who have matching services and add services to them
    const suppliersWithServices = suppliers
      .filter((supplier) => servicesBySupplier[supplier._id.toString()])
      .map((supplier) => ({
        ...supplier.toObject(),
        services: servicesBySupplier[supplier._id.toString()] || [],
      }));

    // Get total count for pagination
    const total = suppliersWithServices.length;

    res.json({
      success: true,
      data: suppliersWithServices,
      count: total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) * parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get suppliers with services error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers with services",
      error: error.message,
    });
  }
});

// @desc    Get single supplier with services
// @route   GET /api/suppliers/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const supplier = await User.findOne({
      _id: req.params.id,
      role: "supplier",
      isActive: true,
    }).select(
      "name email profileImage supplierDetails isVerified isActive createdAt"
    );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Get supplier's services
    const services = await Service.find({
      supplierId: supplier._id,
      status: "active",
      available: true,
    }).sort({ "rating.average": -1, createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...supplier.toObject(),
        services,
      },
    });
  } catch (error) {
    console.error("Get supplier error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier",
      error: error.message,
    });
  }
});

// @desc    Get supplier services
// @route   GET /api/suppliers/:id/services
// @access  Public
router.get("/:id/services", async (req, res) => {
  try {
    const { category, available = true } = req.query;

    // Verify supplier exists
    const supplier = await User.findOne({
      _id: req.params.id,
      role: "supplier",
      isActive: true,
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Build service filter
    const serviceFilter = {
      supplierId: req.params.id,
      status: "active",
    };

    if (category) serviceFilter.category = category;
    if (available !== undefined) serviceFilter.available = available === "true";

    // Get services
    const services = await Service.find(serviceFilter).sort({
      "rating.average": -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      data: services,
      count: services.length,
    });
  } catch (error) {
    console.error("Get supplier services error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier services",
      error: error.message,
    });
  }
});

/**
 * Get all suppliers with their services and packages
 * Query params:
 *   - category: Filter by service category
 *   - city: Filter by supplier city
 *   - minRating: Filter by minimum rating
 *   - search: Search by supplier name or service title
 *   - page: Pagination (default: 1)
 *   - limit: Results per page (default: 20)
 */

/**
 * Get single supplier with all services and packages
 * Route: GET /api/suppliers/:supplierId
 */
router.get("/:supplierId", async (req, res) => {
  try {
    const { supplierId } = req.params;

    // Get supplier details
    const supplier = await User.findById(supplierId)
      .select(
        "_id name email phone companyName profileImage description isActive isVerified memberSince location rating categories experience businessHours certifications languages paymentMethods"
      )
      .lean();

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Get all services of this supplier
    const services = await Service.find({ supplierId, available: true }).lean();

    // Format supplier with services
    const supplierData = {
      supplierId: supplier._id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      companyName: supplier.companyName,
      profileImage: supplier.profileImage,
      description: supplier.description,
      isVerified: supplier.isVerified,
      memberSince: supplier.memberSince,

      // Location
      location: {
        city: supplier.location?.city,
        address: supplier.location?.address,
        coordinates: supplier.location?.coordinates,
        serviceRadius: supplier.location?.serviceRadius,
      },

      // Rating
      rating: {
        average: supplier.rating?.average || 0,
        count: supplier.rating?.count || 0,
      },

      // Additional Info
      experience: supplier.experience,
      categories: supplier.categories || [],
      languages: supplier.languages || [],
      paymentMethods: supplier.paymentMethods || [],

      // Business Hours
      businessHours: supplier.businessHours || {},

      // Certifications
      certifications: (supplier.certifications || []).map((cert) => ({
        name: cert.name,
        issuer: cert.issuer,
        date: cert.date,
        expiryDate: cert.expiryDate,
      })),

      // Services
      services: services.map((service) => ({
        serviceId: service._id,
        title: service.title,
        description: service.description,
        category: service.category,
        subcategories: service.subcategories || [],
        tags: service.tags || [],

        price: {
          amount: service.price?.amount || 0,
          currency: service.price?.currency || "USD",
          pricingType: service.price?.pricingType || "fixed",
          minPrice: service.price?.minPrice,
          maxPrice: service.price?.maxPrice,
        },

        packages: (service.packages || []).map((pkg) => ({
          _id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          price: pkg.price,
          features: pkg.features || [],
          duration: pkg.duration,
          isPopular: pkg.isPopular || false,
        })),

        rating: service.rating
          ? {
              average: service.rating.average || 0,
              count: service.rating.count || 0,
            }
          : { average: 0, count: 0 },

        availability: {
          startDate: service.availability?.startDate,
          endDate: service.availability?.endDate,
          workingHours: service.availability?.workingHours,
          leadTime: service.availability?.leadTime,
        },

        location: {
          city: service.location?.city,
          serviceRadius: service.location?.serviceRadius,
        },

        image: service.image,
        portfolio: (service.portfolio || []).map((item) => ({
          title: item.title,
          description: item.description,
          image: item.image,
          eventType: item.eventType,
          date: item.date,
        })),

        available: service.available !== false,
        featured: service.featured || false,
        views: service.views || 0,
      })),
    };

    res.status(200).json({
      success: true,
      message: "Supplier details retrieved successfully",
      data: supplierData,
    });
  } catch (error) {
    console.error("Error fetching supplier details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching supplier details",
      error: error.message,
    });
  }
});

module.exports = router;
