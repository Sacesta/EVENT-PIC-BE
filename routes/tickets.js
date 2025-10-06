const express = require('express');
const Joi = require('joi');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createTicketSchema = Joi.object({
  eventId: Joi.string().required(),
  eventName: Joi.string().required(),
  title: Joi.string().max(200).required(),
  description: Joi.string().max(1000).optional(),
  type: Joi.string().max(100).required(), // Allow any custom ticket type
  price: Joi.object({
    amount: Joi.number().min(0).required(),
    currency: Joi.string().valid('ILS', 'USD', 'EUR').default('ILS'),
    originalPrice: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).max(100).optional()
  }).required(),
  quantity: Joi.object({
    total: Joi.number().min(1).required(),
    available: Joi.number().min(1).required()
  }).required(),
  validity: Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().required()
  }).required(),
  sales: Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    earlyBirdEndDate: Joi.date().optional(),
    lastMinuteStartDate: Joi.date().optional()
  }).required(),
  features: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    included: Joi.boolean().default(true)
  })).optional(),
  restrictions: Joi.object({
    ageLimit: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional()
    }).optional(),
    maxPerPerson: Joi.number().min(1).default(10).optional(),
    requiresId: Joi.boolean().default(false).optional(),
    specialRequirements: Joi.string().optional()
  }).optional(),
  refundPolicy: Joi.object({
    allowed: Joi.boolean().default(true).optional(),
    deadline: Joi.number().min(0).default(7).optional(),
    fee: Joi.number().min(0).default(0).optional()
  }).optional()
});

const updateTicketSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(1000).optional(),
  type: Joi.string().max(100).optional(), // Allow any custom ticket type
  price: Joi.object({
    amount: Joi.number().min(0).optional(),
    currency: Joi.string().valid('ILS', 'USD', 'EUR').optional(),
    originalPrice: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).max(100).optional()
  }).optional(),
  quantity: Joi.object({
    total: Joi.number().min(1).optional(),
    available: Joi.number().min(1).optional()
  }).optional(),
  validity: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  }).optional(),
  sales: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    earlyBirdEndDate: Joi.date().optional(),
    lastMinuteStartDate: Joi.date().optional()
  }).optional(),
  features: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    included: Joi.boolean().default(true)
  })).optional(),
  restrictions: Joi.object({
    ageLimit: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional()
    }).optional(),
    maxPerPerson: Joi.number().min(1).optional(),
    requiresId: Joi.boolean().optional(),
    specialRequirements: Joi.string().optional()
  }).optional(),
  refundPolicy: Joi.object({
    allowed: Joi.boolean().optional(),
    deadline: Joi.number().min(0).optional(),
    fee: Joi.number().min(0).optional()
  }).optional()
});

// @desc    Create new ticket
// @route   POST /api/tickets
// @access  Private (Producers only)
router.post('/', protect, authorize('producer'), async (req, res) => {
  try {
    // Validate input
    const { error, value } = createTicketSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { eventId, ...ticketData } = value;

    // Check if event exists and belongs to producer
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tickets for this event'
      });
    }

    // Check if event is published
    if (event.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: 'Tickets can only be created for published events'
      });
    }

    // Check if ticket with same title already exists for this event
    const existingTicket = await Ticket.findOne({
      eventId,
      title: ticketData.title
    });

    if (existingTicket) {
      return res.status(400).json({
        success: false,
        message: 'Ticket with this title already exists for this event'
      });
    }

    // Create ticket
    const ticket = await Ticket.create({
      ...ticketData,
      eventId
    });

    // Populate related data
    await ticket.populate('eventId', 'name startDate endDate location');

    res.status(201).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating ticket',
      error: error.message
    });
  }
});

// @desc    Get all tickets (with filtering)
// @route   GET /api/tickets
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      eventId,
      status,
      type,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (eventId) filter.eventId = eventId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    
    if (minPrice || maxPrice) {
      filter['price.amount'] = {};
      if (minPrice) filter['price.amount'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['price.amount'].$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by user role
    if (req.user.role === 'producer') {
      // Filter tickets by events that belong to the producer
      const Event = require('../models/Event');
      const producerEvents = await Event.find({ producerId: req.user._id }).select('_id');
      const eventIds = producerEvents.map(event => event._id);
      filter.eventId = { $in: eventIds };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const tickets = await Ticket.find(filter)
      .populate('eventId', 'name startDate endDate location')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Ticket.countDocuments(filter);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTickets: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tickets',
      error: error.message
    });
  }
});

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('eventId', 'name startDate endDate location description producerId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is authorized to view this ticket
    if (req.user.role !== 'admin' && 
        ticket.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this ticket'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ticket',
      error: error.message
    });
  }
});

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private (Producer only)
router.put('/:id', protect, authorize('producer'), async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateTicketSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const ticket = await Ticket.findById(req.params.id)
      .populate('eventId', 'producerId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is authorized to update this ticket
    if (ticket.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ticket'
      });
    }

    // Update ticket
    Object.assign(ticket, value);
    await ticket.save();

    // Populate related data
    await ticket.populate('eventId', 'name startDate endDate location');

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating ticket',
      error: error.message
    });
  }
});

// @desc    Delete ticket
// @route   DELETE /api/tickets/:id
// @access  Private (Producer only)
router.delete('/:id', protect, authorize('producer'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('eventId', 'producerId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is authorized to delete this ticket
    if (ticket.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this ticket'
      });
    }

    // Check if tickets have been sold
    if (ticket.quantity.sold > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tickets that have already been sold'
      });
    }

    await Ticket.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting ticket',
      error: error.message
    });
  }
});

// @desc    Get tickets by event
// @route   GET /api/tickets/event/:eventId
// @access  Public (for published events)
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check if event exists and is published
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Get active tickets for the event
    const tickets = await Ticket.find({
      eventId,
      isActive: true
    }).select('name description price currency quantity soldQuantity maxPerOrder saleStartDate saleEndDate ticketType includes');

    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('Get event tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching event tickets',
      error: error.message
    });
  }
});

// @desc    Toggle ticket status
// @route   PUT /api/tickets/:id/toggle-status
// @access  Private (Producer only)
router.put('/:id/toggle-status', protect, authorize('producer'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('eventId', 'producerId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is authorized to update this ticket
    if (ticket.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ticket'
      });
    }

    // Toggle status between active and paused
    if (ticket.status === 'active') {
      ticket.status = 'paused';
    } else if (ticket.status === 'paused') {
      ticket.status = 'active';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Can only toggle between active and paused status'
      });
    }

    await ticket.save();

    res.json({
      success: true,
      message: `Ticket status updated to ${ticket.status}`,
      data: ticket
    });
  } catch (error) {
    console.error('Toggle ticket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling ticket status',
      error: error.message
    });
  }
});

// @desc    Get ticket statistics for current user
// @route   GET /api/tickets/stats/me
// @access  Private (Producer only)
router.get('/stats/me', protect, authorize('producer'), async (req, res) => {
  try {
    // Get events created by the producer
    const Event = require('../models/Event');
    const producerEvents = await Event.find({ producerId: req.user._id }).select('_id');
    const eventIds = producerEvents.map(event => event._id);

    if (eventIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalTickets: 0,
          activeTickets: 0,
          totalRevenue: 0,
          totalSold: 0,
          averagePrice: 0
        }
      });
    }

    // Aggregate ticket statistics
    const stats = await Ticket.aggregate([
      { $match: { eventId: { $in: eventIds } } },
      {
        $group: {
          _id: null,
          totalTickets: { $sum: 1 },
          totalRevenue: { $sum: { $multiply: ['$quantity.sold', '$price.amount'] } },
          totalSold: { $sum: '$quantity.sold' },
          totalAvailable: { $sum: '$quantity.available' },
          avgPrice: { $avg: '$price.amount' }
        }
      }
    ]);

    // Count active tickets
    const activeTickets = await Ticket.countDocuments({
      eventId: { $in: eventIds },
      status: 'active'
    });

    const result = stats.length > 0 ? stats[0] : {
      totalTickets: 0,
      totalRevenue: 0,
      totalSold: 0,
      totalAvailable: 0,
      avgPrice: 0
    };

    res.json({
      success: true,
      data: {
        totalTickets: result.totalTickets,
        activeTickets,
        totalRevenue: result.totalRevenue || 0,
        totalSold: result.totalSold || 0,
        totalAvailable: result.totalAvailable || 0,
        averagePrice: result.avgPrice || 0
      }
    });
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ticket statistics',
      error: error.message
    });
  }
});

// @desc    Get ticket analytics
// @route   GET /api/tickets/:id/analytics
// @access  Private (Producer only)
router.get('/:id/analytics', protect, authorize('producer'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('eventId', 'producerId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is authorized to view analytics for this ticket
    if (ticket.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view analytics for this ticket'
      });
    }

    // Calculate analytics
    const analytics = {
      totalQuantity: ticket.quantity.total,
      availableQuantity: ticket.quantity.available,
      soldQuantity: ticket.quantity.sold,
      reservedQuantity: ticket.quantity.reserved,
      soldPercentage: ((ticket.quantity.sold / ticket.quantity.total) * 100).toFixed(2),
      revenue: ticket.quantity.sold * ticket.price.amount,
      averagePrice: ticket.price.amount,
      discountAmount: ticket.price.originalPrice ? ticket.price.originalPrice - ticket.price.amount : 0,
      discountPercentage: ticket.price.originalPrice ? ((ticket.price.originalPrice - ticket.price.amount) / ticket.price.originalPrice * 100).toFixed(2) : 0
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get ticket analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ticket analytics',
      error: error.message
    });
  }
});

module.exports = router; 