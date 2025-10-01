const express = require('express');
const Joi = require('joi');
const Event = require('../models/Event');
const User = require('../models/User');
const Service = require('../models/Service');
const Order = require('../models/Order');
const { protect, authorize, requireApprovedSupplier } = require('../middleware/auth');

const router = express.Router();

// Enhanced validation schemas
const createEventSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  description: Joi.string().min(10).max(2000).optional(),
  image: Joi.string().optional(),
  startDate: Joi.date().greater('now').required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
  location: Joi.object({
    address: Joi.string().required(),
    city: Joi.string().required(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional()
    }).optional()
  }).required(),
  language: Joi.string().valid('he', 'en', 'ar').default('he'),
  category: Joi.string().valid(
  'birthday',
  'wedding',
  'corporate',
  'conference',
  'workshop',
  'concert',
  'festival',
  'graduation',
  'anniversary',
  'baby-shower',
  'networking',
  'charity',
  'other'
).required(),

  requiredServices: Joi.array().items(Joi.string().valid(
       'photography', 'videography', 'catering', 'music', 
      'decoration', 'transportation', 'security', 'lighting', 'sound', 'furniture', 'tents', 'other'
  )).optional(),
  // Enhanced suppliers array to handle multiple services per supplier
  // Supports both nested (new) and flat (legacy) structures
  suppliers: Joi.array().items(
    Joi.alternatives().try(
      // New nested structure: suppliers[0].services[0].serviceId
      Joi.object({
        supplierId: Joi.string().required(),
        services: Joi.array().items(Joi.object({
          serviceId: Joi.string().required(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string().valid('low', 'medium', 'high').default('medium')
        })).min(1).required()
      }),
      // Legacy flat structure: suppliers[0].serviceId
      Joi.object({
        supplierId: Joi.string().required(),
        serviceId: Joi.string().required(),
        requestedPrice: Joi.number().min(0).optional(),
        notes: Joi.string().max(500).optional(),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium')
      })
    )
  ).optional(),
  isPublic: Joi.boolean().default(false),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).required(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional()
    }).optional()
  }).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  featured: Joi.boolean().default(false).optional(),
  status: Joi.string().valid('draft', 'approved', 'rejected', 'completed').optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    spent: Joi.number().min(0).optional()
  }).optional()
});

const updateEventSchema = Joi.object({
  name: Joi.string().min(2).max(200).optional(),
  description: Joi.string().min(10).max(2000).optional(),
  image: Joi.string().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  location: Joi.object({
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional()
    }).optional()
  }).optional(),
  language: Joi.string().valid('he', 'en', 'ar').optional(),
  category: Joi.string().valid(
    'birthday',
  'wedding',
  'corporate',
  'conference',
  'workshop',
  'concert',
  'festival',
  'graduation',
  'anniversary',
  'baby-shower',
  'networking',
  'charity',
  'other'
  ).optional(),
  requiredServices: Joi.array().items(Joi.string().valid(
       'photography', 'videography', 'catering', 'music', 
      'decoration', 'transportation', 'security', 'lighting' , 'sound', 'furniture', 'tents', 'other'
  )).optional(),
  // Supports both nested (new) and flat (legacy) structures
  suppliers: Joi.array().items(
    Joi.alternatives().try(
      // New nested structure: suppliers[0].services[0].serviceId
      Joi.object({
        supplierId: Joi.string().required(),
        services: Joi.array().items(Joi.object({
          serviceId: Joi.string().required(),
          requestedPrice: Joi.number().min(0).optional(),
          notes: Joi.string().max(500).optional(),
          priority: Joi.string().valid('low', 'medium', 'high').default('medium')
        })).min(1).required()
      }),
      // Legacy flat structure: suppliers[0].serviceId
      Joi.object({
        supplierId: Joi.string().required(),
        serviceId: Joi.string().required(),
        requestedPrice: Joi.number().min(0).optional(),
        notes: Joi.string().max(500).optional(),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium')
      })
    )
  ).optional(),
  isPublic: Joi.boolean().optional(),
  ticketInfo: Joi.object({
    availableTickets: Joi.number().min(0).optional(),
    soldTickets: Joi.number().min(0).optional(),
    reservedTickets: Joi.number().min(0).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional()
    }).optional()
  }).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  status: Joi.string().valid('draft', 'approved', 'rejected', 'completed').optional(),
  budget: Joi.object({
    total: Joi.number().min(0).optional(),
    allocated: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    spent: Joi.number().min(0).optional()
  }).optional()
});

const addSuppliersSchema = Joi.object({
  suppliers: Joi.array().items(Joi.object({
    supplierId: Joi.string().required(),
    services: Joi.array().items(Joi.object({
      serviceId: Joi.string().required(),
      requestedPrice: Joi.number().min(0).optional(),
      notes: Joi.string().max(500).optional(),
      priority: Joi.string().valid('low', 'medium', 'high').default('medium')
    })).min(1).required()
  })).min(1).required()
});

const updateSupplierStatusSchema = Joi.object({
  supplierId: Joi.string().optional(),
  serviceId: Joi.object().optional(),
  status: Joi.string().valid('approved', 'rejected').required()
});

// @desc    Create new event with multiple suppliers and services
// @route   POST /api/events
// @access  Private (Producers only)
router.post('/', protect, authorize('producer'), async (req, res) => {
  try {
    // Validate input
    console.log("req.body----?",req.body);
    const { error, value } = createEventSchema.validate(req.body);

    console.log("error : ",error);
    if (error) {
      return res.status(400).json({
        success: false,
        message:error.message,
        errors: error.details.map(detail => detail.message)
      });
    }

    // Validate suppliers and services exist
    if (value.suppliers && value.suppliers.length > 0) {
      const supplierIds = value.suppliers.map(s => s.supplierId);
      const serviceIds = value.suppliers.flatMap(s => s.services.map(srv => srv.serviceId));

      // Check if all suppliers exist and are verified
      const suppliers = await User.find({
        _id: { $in: supplierIds },
        role: 'supplier',
        isVerified: true,
        isActive: true
      });

      if (suppliers.length !== supplierIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more suppliers not found or not verified'
        });
      }

      // Check if all services exist and belong to the respective suppliers
      const services = await Service.find({ _id: { $in: serviceIds } });
      if (services.length !== serviceIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more services not found'
        });
      }

      // Validate that each service belongs to the correct supplier
      for (const supplierData of value.suppliers) {
        const supplierServices = services.filter(s => 
          s.supplierId.toString() === supplierData.supplierId
        );
        
        const requestedServiceIds = supplierData.services.map(s => s.serviceId);
        const availableServiceIds = supplierServices.map(s => s._id.toString());
        
        const invalidServices = requestedServiceIds.filter(id => 
          !availableServiceIds.includes(id)
        );
        
        if (invalidServices.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Services ${invalidServices.join(', ')} do not belong to supplier ${supplierData.supplierId}`
          });
        }
      }
    }

    // Transform suppliers data for the schema
    const transformedSuppliers = value.suppliers ? value.suppliers.flatMap(supplier => 
      supplier.services.map(service => ({
        supplierId: supplier.supplierId,
        serviceId: service.serviceId,
        requestedPrice: service.requestedPrice,
        notes: service.notes,
        priority: service.priority,
        status: 'pending'
      }))
    ) : [];

    // Create event
    const eventData = {
      ...value,
      suppliers: transformedSuppliers,
      producerId: req.user._id
    };
    
    // If ticketInfo is not provided, set default values to satisfy model requirements
    if (!eventData.ticketInfo) {
      eventData.ticketInfo = {
        availableTickets: 0,
        soldTickets: 0,
        reservedTickets: 0
      };
    }
    
    delete eventData.suppliers; // Remove the transformed suppliers temporarily
    const event = await Event.create(eventData);

    // Add suppliers using the model method
    for (const supplier of transformedSuppliers) {
      await event.addSupplierWithDetails(
        supplier.supplierId, 
        supplier.serviceId, 
        {
          requestedPrice: supplier.requestedPrice,
          notes: supplier.notes,
          priority: supplier.priority
        }
      );
    }


    // Populate and return the created event
    const populatedEvent = await Event.findById(event._id)
      .populate('producerId', 'name companyName profileImage')
      .populate('suppliers.supplierId', 'name companyName profileImage supplierDetails')
      .populate('suppliers.serviceId', 'name description price category');

    res.status(201).json({
      success: true,
      data: populatedEvent,
      message: 'Event created successfully with suppliers and services'
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating event',
      error: error.message
    });
  }
});

// @desc    Add multiple suppliers with multiple services to existing event
// @route   POST /api/events/:id/suppliers
// @access  Private (Event producer only)
router.post('/:id/suppliers', protect, async (req, res) => {
  try {
    const { error, value } = addSuppliersSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    // Validate suppliers and services
    const supplierIds = value.suppliers.map(s => s.supplierId);
    const serviceIds = value.suppliers.flatMap(s => s.services.map(srv => srv.serviceId));

    const suppliers = await User.find({
      _id: { $in: supplierIds },
      role: 'supplier',
      isVerified: true,
      isActive: true
    });

    if (suppliers.length !== supplierIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more suppliers not found or not verified'
      });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more services not found'
      });
    }

    // Add suppliers and services
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
              priority: serviceData.priority
            }
          );
          addedSuppliers.push({
            supplierId: supplierData.supplierId,
            serviceId: serviceData.serviceId
          });
        } catch (err) {
          errors.push({
            supplierId: supplierData.supplierId,
            serviceId: serviceData.serviceId,
            error: err.message
          });
        }
      }
    }

    const updatedEvent = await Event.findById(req.params.id)
      .populate('suppliers.supplierId', 'name companyName profileImage')
      .populate('suppliers.serviceId', 'name description price category');

    res.json({
      success: true,
      data: updatedEvent,
      message: `Successfully added ${addedSuppliers.length} supplier-service combinations`,
      details: {
        added: addedSuppliers,
        errors: errors
      }
    });
  } catch (error) {
    console.error('Add suppliers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding suppliers',
      error: error.message
    });
  }
});

// @desc    Update supplier service status with bulk operations
// @route   PUT /api/events/:id/suppliers/bulk-status
// @access  Private (Event producer only)
router.put('/:id/suppliers/bulk-status', protect, async (req, res) => {
  try {
    const { updates } = req.body; // Array of {supplierId, serviceId, status}
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required'
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        if (!['pending', 'approved', 'cancelled', 'rejected'].includes(update.status)) {
          throw new Error('Invalid status');
        }

        await event.updateSupplierStatus(update.supplierId, update.serviceId, update.status);
        results.push({
          supplierId: update.supplierId,
          serviceId: update.serviceId,
          status: update.status,
          success: true
        });
      } catch (err) {
        errors.push({
          supplierId: update.supplierId,
          serviceId: update.serviceId,
          error: err.message
        });
      }
    }

    const updatedEvent = await Event.findById(req.params.id)
      .populate('suppliers.supplierId', 'name companyName profileImage')
      .populate('suppliers.serviceId', 'name description price category');

    res.json({
      success: true,
      data: updatedEvent,
      message: `Processed ${results.length} status updates`,
      details: { results, errors }
    });
  } catch (error) {
    console.error('Bulk status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating supplier statuses',
      error: error.message
    });
  }
});

// @desc    Remove supplier service from event
// @route   DELETE /api/events/:id/suppliers/:supplierId/:serviceId
// @access  Private (Event producer only)
router.delete('/:id/suppliers/:supplierId/:serviceId', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    await event.removeSupplier(req.params.supplierId, req.params.serviceId);

    res.json({
      success: true,
      message: 'Supplier service removed successfully'
    });
  } catch (error) {
    console.error('Remove supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing supplier service',
      error: error.message
    });
  }
});

// @desc    Update supplier status for event
// @route   PUT /api/events/:eventId/supplier-status
router.put('/:eventId/supplier-status', protect, async (req, res) => {
  try {
    // Validate input

    console.log(req.body);
    const { error, value } = updateSupplierStatusSchema.validate(req.body);

    console.log("error : ",error);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details.map(detail => detail.message)
      });
    }

    const { supplierId, serviceId, status } = value;

    // Find the event
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    console.log("supplierId--->",supplierId);
    console.log("serviceId--->",serviceId);

    // Find the supplier in the event
    const supplierIndex = event.suppliers.findIndex(
      s => s.supplierId.toString() === supplierId && 
           s.serviceId.toString() === serviceId._id
    );

    if (supplierIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Supplier service not found in this event'
      });
    }

    // Update the supplier status
    event.suppliers[supplierIndex].status = status;
    
    // Set confirmation timestamp if approved
    if (status === 'approved') {
      event.suppliers[supplierIndex].confirmedAt = new Date();
    }

    // Update the main event status based on supplier status
    if (status === 'approved') {
      event.status = 'approved'; // Change from draft to approved when supplier is approved
    } else if (status === 'rejected') {
      event.status = 'rejected'; // Change to rejected when supplier is rejected
    }

    // Save the event
    await event.save();

    // Populate and return the updated event
    const updatedEvent = await Event.findById(req.params.eventId)
      .populate('producerId', 'name companyName profileImage')
      .populate('suppliers.supplierId', 'name companyName profileImage supplierDetails')
      .populate('suppliers.serviceId', 'name description price category');

    res.json({
      success: true,
      data: updatedEvent,
      message: `Supplier status updated to ${status} successfully`
    });
  } catch (error) {
    console.error('Update supplier status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating supplier status',
      error: error.message
    });
  }
});

// @desc    Get event suppliers with their services
// @route   GET /api/events/:id/suppliers
// @access  Public
router.get('/:id/suppliers', async (req, res) => {
  try {
    const { status, category } = req.query;
    
    const event = await Event.findById(req.params.id)
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage supplierDetails',
        match: { isActive: true }
      })
      .populate({
        path: 'suppliers.serviceId',
        select: 'name description price category images',
        match: category ? { category } : {}
      });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    let suppliers = event.suppliers.filter(s => s.supplierId && s.serviceId);
    
    if (status) {
      suppliers = suppliers.filter(s => s.status === status);
    }

    // Group by supplier
    const groupedSuppliers = suppliers.reduce((acc, supplier) => {
      const supplierId = supplier.supplierId._id.toString();
      if (!acc[supplierId]) {
        acc[supplierId] = {
          supplier: supplier.supplierId,
          services: []
        };
      }
      acc[supplierId].services.push({
        service: supplier.serviceId,
        status: supplier.status,
        requestedPrice: supplier.requestedPrice,
        notes: supplier.notes,
        priority: supplier.priority,
        confirmedAt: supplier.confirmedAt
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: Object.values(groupedSuppliers),
      count: Object.keys(groupedSuppliers).length
    });
  } catch (error) {
    console.error('Get event suppliers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event suppliers',
      error: error.message
    });
  }
});

// @desc    Get supplier recommendations for event
// @route   GET /api/events/:id/supplier-recommendations
// @access  Private (Event producer only)
router.get('/:id/supplier-recommendations', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this event'
      });
    }

    const { category, maxPrice, minRating } = req.query;
    
    // Find suppliers in the same city with required services
    const filter = {
      role: 'supplier',
      isVerified: true,
      isActive: true
    };

    if (minRating) {
      filter['supplierDetails.rating.average'] = { $gte: parseFloat(minRating) };
    }

    const suppliers = await User.find(filter)
      .populate({
        path: 'services',
        match: {
          isActive: true,
          ...(category && { category }),
          ...(maxPrice && { 'price.amount': { $lte: parseFloat(maxPrice) } })
        }
      })
      .sort({ 'supplierDetails.rating.average': -1 })
      .limit(20);

    // Filter suppliers who have at least one matching service
    const recommendations = suppliers
      .filter(supplier => supplier.services && supplier.services.length > 0)
      .map(supplier => ({
        supplier: {
          _id: supplier._id,
          name: supplier.name,
          companyName: supplier.supplierDetails?.companyName,
          profileImage: supplier.profileImage,
          rating: supplier.supplierDetails?.rating,
          experience: supplier.supplierDetails?.experience
        },
        services: supplier.services,
        matchingServices: supplier.services.filter(service => 
          !event.requiredServices || 
          event.requiredServices.includes(service.category)
        ).length
      }))
      .sort((a, b) => b.matchingServices - a.matchingServices);

    res.json({
      success: true,
      data: recommendations,
      count: recommendations.length
    });
  } catch (error) {
    console.error('Get supplier recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier recommendations',
      error: error.message
    });
  }
});

// @desc    Get all events created by the current logged-in producer with full details
// @route   GET /api/events/my-events
// @access  Private (Producer only)
router.get('/my-events', protect, authorize('producer'), async (req, res) => {
  try {
    const producerId = req.user._id; // Current logged-in producer ID
    
    const {
      page = 1,
      limit = 10,
      status, // Event status filter
      category, // Event category filter
      search, // Search term
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate, // Filter by event start date
      endDate // Filter by event end date
    } = req.query;

    console.log("Producer ID:", producerId);
    console.log("Query parameters:", { page, limit, status, category, search, sortBy, sortOrder });

    // Build filter for events created by this producer
    const filter = {
      producerId: producerId
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
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { 'location.address': searchRegex },
        { 'location.city': searchRegex }
      ];
    }

    console.log("MongoDB filter:", JSON.stringify(filter, null, 2));

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with full population
    const events = await Event.find(filter)
      .populate('producerId', 'name companyName profileImage email phone')
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage supplierDetails email phone',
        match: { isActive: true }
      })
      .populate({
        path: 'suppliers.serviceId',
        select: 'name description price category images availability location'
      })
      .populate('tickets')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    console.log(`Found ${events.length} events for producer ${producerId}`);

    // Enhance events with additional details and statistics
    const enhancedEvents = events.map(event => {
      const eventObj = event.toObject();
      
      // Ensure all array fields are properly initialized to prevent frontend errors
      eventObj.suppliers = eventObj.suppliers || [];
      eventObj.requiredServices = eventObj.requiredServices || [];
      eventObj.tags = eventObj.tags || [];
      
      // Ensure nested objects are properly initialized
      if (!eventObj.location) {
        eventObj.location = { address: '', city: '', coordinates: {} };
      }
      if (!eventObj.ticketInfo) {
        eventObj.ticketInfo = { availableTickets: 0, soldTickets: 0, reservedTickets: 0 };
      }
      if (!eventObj.budget) {
        eventObj.budget = { total: 0, allocated: {}, spent: 0 };
      }
      
      // Add supplier statistics
      const suppliers = eventObj.suppliers || [];
      const uniqueSuppliers = [...new Set(suppliers.map(s => s.supplierId?._id?.toString()).filter(Boolean))];
      
      eventObj.supplierStats = {
        totalSuppliers: uniqueSuppliers.length,
        totalServices: suppliers.length,
        approvedServices: suppliers.filter(s => s.status === 'approved').length,
        pendingServices: suppliers.filter(s => s.status === 'pending').length,
        rejectedServices: suppliers.filter(s => s.status === 'rejected').length,
        cancelledServices: suppliers.filter(s => s.status === 'cancelled').length
      };

      // Add financial summary
      const totalRequestedPrice = suppliers.reduce((sum, s) => sum + (s.requestedPrice || 0), 0);
      const totalFinalPrice = suppliers
        .filter(s => s.status === 'approved' && s.finalPrice)
        .reduce((sum, s) => sum + s.finalPrice, 0);

      eventObj.financialSummary = {
        totalRequestedPrice,
        totalFinalPrice,
        estimatedCost: totalFinalPrice || totalRequestedPrice,
        budgetUtilization: eventObj.budget?.total ? 
          ((totalFinalPrice || totalRequestedPrice) / eventObj.budget.total) * 100 : 0
      };

      // Group suppliers by supplier for better organization
      eventObj.groupedSuppliers = suppliers
        .filter(s => s.supplierId && s.serviceId)
        .reduce((acc, supplier) => {
          const supplierId = supplier.supplierId._id.toString();
          if (!acc[supplierId]) {
            acc[supplierId] = {
              supplier: supplier.supplierId,
              services: []
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
            messages: supplier.messages || []
          });
          return acc;
        }, {});

      // Convert grouped suppliers to array
      eventObj.groupedSuppliersArray = Object.values(eventObj.groupedSuppliers);

      // Add event status indicators
      eventObj.statusIndicators = {
        isUpcoming: new Date(eventObj.startDate) > new Date(),
        isPast: new Date(eventObj.endDate) < new Date(),
        isActive: new Date() >= new Date(eventObj.startDate) && new Date() <= new Date(eventObj.endDate),
        daysUntilEvent: Math.ceil((new Date(eventObj.startDate) - new Date()) / (1000 * 60 * 60 * 24)),
        duration: Math.ceil((new Date(eventObj.endDate) - new Date(eventObj.startDate)) / (1000 * 60 * 60 * 24))
      };

      return eventObj;
    });

    // Get total count for pagination - FIXED: Use the same filter that was used for the query
    const totalFilteredEvents = await Event.countDocuments(filter);

    // Calculate overall statistics for the producer
    const allProducerEvents = await Event.find({ producerId });
    const overallStats = {
      totalEvents: allProducerEvents.length,
      draftEvents: allProducerEvents.filter(e => e.status === 'draft').length,
      approvedEvents: allProducerEvents.filter(e => e.status === 'approved').length,
      completedEvents: allProducerEvents.filter(e => e.status === 'completed').length,
      rejectedEvents: allProducerEvents.filter(e => e.status === 'rejected').length,
      upcomingEvents: allProducerEvents.filter(e => new Date(e.startDate) > new Date()).length,
      pastEvents: allProducerEvents.filter(e => new Date(e.endDate) < new Date()).length
    };

    // Calculate total suppliers and services across all events
    let totalUniqueSuppliers = new Set();
    let totalServices = 0;
    let totalApprovedServices = 0;
    let totalSpent = 0;

    allProducerEvents.forEach(event => {
      event.suppliers.forEach(supplier => {
        if (supplier.supplierId) {
          totalUniqueSuppliers.add(supplier.supplierId.toString());
          totalServices++;
          if (supplier.status === 'approved') {
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
        hasPrevPage: page > 1
      },
      overallStats,
      message: `Found ${enhancedEvents.length} events for producer`
    });

  } catch (error) {
    console.error('Get producer events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching producer events',
      error: error.message
    });
  }
});

// @desc    Get all events (with filtering) - Enhanced version
// @route   GET /api/events
// @access  Public
router.get('/', async (req, res) => {
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
      supplierId
    } = req.query;

    // console.log(minPrice,maxPrice);

    console.log("category--->", category);

    // Build filter object
    const filter = { isPublic:true };
    
    if (category) filter.category = category;
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (language) filter.language = language;
    if (featured !== undefined) filter.featured = featured === 'true';
    
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    if (supplierId) {
      filter['suppliers.supplierId'] = supplierId;
    }


    if (minPrice || maxPrice) {
      const priceFilter = {};
      
      // For minPrice: find events where the maximum price is >= minPrice
      // This ensures we get events that have tickets at or above the minimum price we're looking for
      if (minPrice) {
        priceFilter['ticketInfo.priceRange.max'] = { $gte: parseFloat(minPrice) };
      }
      
      // For maxPrice: find events where the minimum price is <= maxPrice  
      // This ensures we get events that have tickets at or below the maximum price we're willing to pay
      if (maxPrice) {
        priceFilter['ticketInfo.priceRange.min'] = { $lte: parseFloat(maxPrice) };
      }
      
      // Combine the price filters using $and to ensure both conditions are met
      if (minPrice && maxPrice) {
        filter.$and = filter.$and || [];
        filter.$and.push(priceFilter);
      } else {
        Object.assign(filter, priceFilter);
      }
    }

    if (hasAvailableTickets === 'true') {
      filter.$expr = { $gt: ['$ticketInfo.availableTickets', '$ticketInfo.soldTickets'] };
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // FIXED: Reset to page 1 when search is provided
    let currentPage = parseInt(page);
    if (search && search.trim()) {
      currentPage = 1;
    }

    // Execute query with pagination
    const events = await Event.find(filter)
      .populate('producerId', 'name companyName profileImage')
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage',
        match: { isActive: true }
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
        hasPrevPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
});



// @desc    Get single event with full supplier and service details
// @route   GET /api/events/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('producerId', 'name companyName profileImage')
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage supplierDetails',
        match: { isActive: true }
      })
      .populate({
        path: 'suppliers.serviceId',
        select: 'name description price category images availability'
      })
      .populate('tickets');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Increment views for public events
    if (event.isPublic && event.status === 'approved') {
      event.views += 1;
      await event.save();
    }

    // Group suppliers by supplier ID for better organization
    const groupedSuppliers = event.suppliers
      .filter(s => s.supplierId && s.serviceId)
      .reduce((acc, supplier) => {
        const supplierId = supplier.supplierId._id.toString();
        if (!acc[supplierId]) {
          acc[supplierId] = {
            supplier: supplier.supplierId,
            services: []
          };
        }
        acc[supplierId].services.push({
          service: supplier.serviceId,
          status: supplier.status,
          requestedPrice: supplier.requestedPrice,
          notes: supplier.notes,
          priority: supplier.priority,
          confirmedAt: supplier.confirmedAt
        });
        return acc;
      }, {});

    const eventData = event.toObject();
    eventData.groupedSuppliers = Object.values(groupedSuppliers);

    res.json({
      success: true,
      data: eventData
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
});



// @desc    Get all events for a specific supplier
// @route   GET /api/events/supplier/:supplierId
// @access  Private (Supplier only)
router.get('/supplier/:supplierId', protect, async (req, res) => {
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
      sortBy = 'startDate'
    } = req.query;

    console.log("supplierId--->", supplierId);
    console.log("supplier Data --------->", req.user.role, req.user._id.toString());
    console.log("Query parameters:", { page, limit, status, supplierStatus, category, search, city, sortBy });

    // Authorization check - suppliers can only see their own events
    if (req.user.role === 'supplier' && req.user._id.toString() !== supplierId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access events for this supplier'
      });
    }

    // Build filter for events
    const filter = {
      'suppliers.supplierId': supplierId,
      // Filter out past events - only show current and future events
      endDate: { $gte: new Date() }
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
      filter['location.city'] = { $regex: city, $options: 'i' };
    }

    // Add search filter (search in name, description, location)
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { 'location.address': searchRegex },
        { 'location.city': searchRegex }
      ];
    }

    console.log("MongoDB filter:", JSON.stringify(filter, null, 2));

    // Find events with filters
    let query = Event.find(filter)
      .populate('producerId', 'name companyName profileImage')
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage',
        match: { _id: supplierId }
      })
      .populate('suppliers.serviceId', 'name description price category')
      .sort({ [sortBy]: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const events = await query.exec();

    console.log(`Found ${events.length} events before filtering`);

    // Filter supplier data to only show current supplier's services
    const filteredEvents = events.map(event => {
      const eventObj = event.toObject();
      eventObj.suppliers = eventObj.suppliers.filter(supplier => 
        supplier.supplierId && supplier.supplierId._id.toString() === supplierId
      );

      // Filter by supplier status if provided
      if (supplierStatus) {
        eventObj.suppliers = eventObj.suppliers.filter(supplier => 
          supplier.status === supplierStatus
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
        daysUntilStart: Math.ceil((eventStartDate - now) / (1000 * 60 * 60 * 24)),
        daysUntilEnd: Math.ceil((eventEndDate - now) / (1000 * 60 * 60 * 24))
      };

      // Add flag to indicate if supplier can modify their status
      // Suppliers can only approve/reject if:
      // 1. Event hasn't started yet (or is currently active)
      // 2. Their current status is 'pending'
      eventObj.suppliers = eventObj.suppliers.map(supplier => {
        const canModifyStatus = !eventObj.eventDateStatus.hasEnded && 
                               supplier.status === 'pending';
        
        return {
          ...supplier,
          canModifyStatus,
          canApprove: canModifyStatus,
          canReject: canModifyStatus
        };
      });

      return eventObj;
    }).filter(event => event.suppliers.length > 0); // Only return events where supplier has services

    console.log(`Returning ${filteredEvents.length} events after filtering`);

    // Get total count with the same filters
    const total = await Event.countDocuments(filter);

    // Calculate summary
    const allSupplierEvents = await Event.find({ 'suppliers.supplierId': supplierId });
    let totalServices = 0;
    let confirmedServices = 0;
    let totalEarnings = 0;

    allSupplierEvents.forEach(event => {
      event.suppliers.forEach(supplier => {
        if (supplier.supplierId.toString() === supplierId) {
          totalServices++;
          if (supplier.status === 'approved') {
            confirmedServices++;
            totalEarnings += supplier.finalPrice || supplier.requestedPrice || 0;
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
        hasPrevPage: page > 1
      },
      summary: {
        totalServices,
        confirmedServices,
        pendingServices: totalServices - confirmedServices,
        totalEarnings
      }
    });
  } catch (error) {
    console.error('Get supplier events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier events',
      error: error.message
    });
  }
});






// @desc    Update event created by producer
// @route   PUT /api/events/:id
// @access  Private (Producer only - own events)
router.put('/:id', protect, authorize('producer'), async (req, res) => {
  try {
    // Validate input
    console.log("req.body----?", req.body);
    const { error, value } = updateEventSchema.validate(req.body);

    console.log("error : ", error);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.details.map(detail => detail.message)
      });
    }

    // Find the event
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if the current user is the producer who created this event
    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this event. You can only update events you created.'
      });
    }

    // Validate suppliers and services if being updated (same logic as create endpoint)
    if (value.suppliers && value.suppliers.length > 0) {
      const supplierIds = value.suppliers.map(s => s.supplierId);
      const serviceIds = value.suppliers.flatMap(s => s.services ? s.services.map(srv => srv.serviceId) : [s.serviceId]);

      // Check if all suppliers exist and are verified
      const suppliers = await User.find({
        _id: { $in: supplierIds },
        role: 'supplier',
        isVerified: true,
        isActive: true
      });

      if (suppliers.length !== supplierIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more suppliers not found or not verified'
        });
      }

      // Check if all services exist and belong to the respective suppliers
      const services = await Service.find({ _id: { $in: serviceIds } });
      if (services.length !== serviceIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more services not found'
        });
      }

      // Validate that each service belongs to the correct supplier
      for (const supplierData of value.suppliers) {
        const supplierServices = services.filter(s => 
          s.supplierId.toString() === supplierData.supplierId
        );
        
        const requestedServiceIds = supplierData.services ? 
          supplierData.services.map(s => s.serviceId) : 
          [supplierData.serviceId];
        const availableServiceIds = supplierServices.map(s => s._id.toString());
        
        const invalidServices = requestedServiceIds.filter(id => 
          !availableServiceIds.includes(id)
        );
        
        if (invalidServices.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Services ${invalidServices.join(', ')} do not belong to supplier ${supplierData.supplierId}`
          });
        }
      }
    }

    // Transform suppliers data for the schema (same as create endpoint)
    const transformedSuppliers = value.suppliers ? value.suppliers.flatMap(supplier => 
      supplier.services ? 
        supplier.services.map(service => ({
          supplierId: supplier.supplierId,
          serviceId: service.serviceId,
          requestedPrice: service.requestedPrice,
          notes: service.notes,
          priority: service.priority,
          status: 'pending'
        })) :
        [{
          supplierId: supplier.supplierId,
          serviceId: supplier.serviceId,
          requestedPrice: supplier.requestedPrice,
          notes: supplier.notes,
          priority: supplier.priority,
          status: 'pending'
        }]
    ) : [];

    // Prepare update data (exclude suppliers for now)
    const updateData = { ...value };
    delete updateData.suppliers;

    // If ticketInfo is not provided, set default values to satisfy model requirements
    if (!updateData.ticketInfo && value.ticketInfo === undefined) {
      // Don't override existing ticketInfo if not provided in update
    } else if (updateData.ticketInfo && !updateData.ticketInfo.availableTickets) {
      updateData.ticketInfo = {
        availableTickets: updateData.ticketInfo.availableTickets || 0,
        soldTickets: updateData.ticketInfo.soldTickets || 0,
        reservedTickets: updateData.ticketInfo.reservedTickets || 0,
        ...updateData.ticketInfo
      };
    }

    // Update the event basic fields
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Handle suppliers update if provided (same logic as create endpoint)
    if (transformedSuppliers.length > 0) {
      // Clear existing suppliers and add new ones
      updatedEvent.suppliers = [];
      await updatedEvent.save();

      // Add suppliers using the model method
      for (const supplier of transformedSuppliers) {
        try {
          await updatedEvent.addSupplierWithDetails(
            supplier.supplierId, 
            supplier.serviceId, 
            {
              requestedPrice: supplier.requestedPrice,
              notes: supplier.notes,
              priority: supplier.priority
            }
          );
        } catch (err) {
          console.warn(`Failed to add supplier ${supplier.supplierId} with service ${supplier.serviceId}:`, err.message);
          // Continue with other suppliers even if one fails
        }
      }
    }

    // Populate and return the updated event
    const populatedEvent = await Event.findById(req.params.id)
      .populate('producerId', 'name companyName profileImage email phone')
      .populate({
        path: 'suppliers.supplierId',
        select: 'name companyName profileImage supplierDetails email phone',
        match: { isActive: true }
      })
      .populate({
        path: 'suppliers.serviceId',
        select: 'name description price category images availability location'
      });

    res.json({
      success: true,
      data: populatedEvent,
      message: 'Event updated successfully with suppliers and services'
    });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating event',
      error: error.message
    });
  }
});

// @desc    Delete event created by producer
// @route   DELETE /api/events/:id
// @access  Private (Producer only - own events)
router.delete('/:id', protect, authorize('producer'), async (req, res) => {
  try {
    // Find the event
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if the current user is the producer who created this event
    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this event. You can only delete events you created.'
      });
    }

    // Check if event has any approved suppliers (optional business rule)
    const approvedSuppliers = event.suppliers.filter(s => s.status === 'approved');
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
      message: 'Event deleted successfully'
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
});

// @desc    Get orders for supplier
// @route   GET /api/events/orders
// @access  Private (Supplier only)
router.get('/orders', protect, requireApprovedSupplier, async (req, res) => {
  try {
    const supplierId = req.user._id; // 👈 current logged-in supplier ID

    console.log("supplierId--->",supplierId);

    const orders = await Order.find({ supplierId })
      .populate('eventId', 'name startDate endDate location')
      .populate('producerId', 'name companyName profileImage')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
});



module.exports = router;
