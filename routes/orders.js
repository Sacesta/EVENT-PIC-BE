const express = require('express');
const Joi = require('joi');
const Order = require('../models/Order');
const Event = require('../models/Event');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createOrderSchema = Joi.object({
  eventId: Joi.string().required(),
  serviceId: Joi.string().required(),
  supplierId: Joi.string().required(),
  quantity: Joi.number().min(1).optional(),
  customRequirements: Joi.string().max(1000).optional(),
  requestedDate: Joi.date().greater('now').required(),
  budget: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional()
  }).optional()
});

const updateOrderSchema = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'in_progress', 'completed', 'cancelled').optional(),
  quantity: Joi.number().min(1).optional(),
  customRequirements: Joi.string().max(1000).optional(),
  requestedDate: Joi.date().greater('now').optional(),
  budget: Joi.object({
    min: Joi.number().min(0).optional(),
    max: Joi.number().min(0).optional()
  }).optional(),
  supplierNotes: Joi.string().max(1000).optional(),
  producerNotes: Joi.string().max(1000).optional()
});

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (Producers only)
router.post('/', protect, authorize('producer'), async (req, res) => {
  try {
    // Validate input
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { eventId, serviceId, supplierId, ...orderData } = value;

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
        message: 'Not authorized to create orders for this event'
      });
    }

    // Check if service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if supplier exists and provides this service
    if (service.supplierId.toString() !== supplierId) {
      return res.status(400).json({
        success: false,
        message: 'Service does not belong to the specified supplier'
      });
    }

    // Check if order already exists for this event-service-supplier combination
    const existingOrder = await Order.findOne({
      eventId,
      serviceId,
      supplierId,
      status: { $nin: ['cancelled', 'completed'] }
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'Order already exists for this event, service, and supplier'
      });
    }

    // Create order
    const order = await Order.create({
      ...orderData,
      eventId,
      serviceId,
      supplierId,
      producerId: req.user._id
    });

    // Populate related data
    await order.populate([
      { path: 'eventId', select: 'name startDate endDate location' },
      { path: 'serviceId', select: 'name category price' },
      { path: 'supplierId', select: 'name companyName profileImage' }
    ]);

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
});

// @desc    Get all orders (with filtering)
// @route   GET /api/orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      eventId,
      serviceId,
      supplierId,
      producerId,
      startDate,
      endDate
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (eventId) filter.eventId = eventId;
    if (serviceId) filter.serviceId = serviceId;
    if (supplierId) filter.supplierId = supplierId;
    if (producerId) filter.producerId = producerId;
    
    if (startDate || endDate) {
      filter.requestedDate = {};
      if (startDate) filter.requestedDate.$gte = new Date(startDate);
      if (endDate) filter.requestedDate.$lte = new Date(endDate);
    }

    // Filter by user role
    if (req.user.role === 'producer') {
      filter.producerId = req.user._id;
    } else if (req.user.role === 'supplier') {
      filter.supplierId = req.user._id;
    }

    // Execute query with pagination
    const orders = await Order.find(filter)
      .populate('eventId', 'name startDate endDate location')
      .populate('serviceId', 'name category price')
      .populate('supplierId', 'name companyName profileImage')
      .populate('producerId', 'name companyName profileImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
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

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private (Order participants only)
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('eventId', 'name startDate endDate location description')
      .populate('serviceId', 'name category price description')
      .populate('supplierId', 'name companyName profileImage phone')
      .populate('producerId', 'name companyName profileImage phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is authorized to view this order
    if (req.user.role !== 'admin' && 
        order.producerId._id.toString() !== req.user._id.toString() && 
        order.supplierId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
});

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private (Order participants only)
router.put('/:id', protect, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is authorized to update this order
    if (req.user.role !== 'admin' && 
        order.producerId.toString() !== req.user._id.toString() && 
        order.supplierId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this order'
      });
    }

    // Role-based update restrictions
    if (req.user.role === 'supplier') {
      // Suppliers can only update certain fields
      const allowedUpdates = ['status', 'supplierNotes', 'quantity'];
      Object.keys(value).forEach(key => {
        if (!allowedUpdates.includes(key)) {
          delete value[key];
        }
      });
    } else if (req.user.role === 'producer') {
      // Producers can only update certain fields
      const allowedUpdates = ['status', 'producerNotes', 'quantity', 'customRequirements', 'requestedDate', 'budget'];
      Object.keys(value).forEach(key => {
        if (!allowedUpdates.includes(key)) {
          delete value[key];
        }
      });
    }

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true }
    ).populate([
      { path: 'eventId', select: 'name startDate endDate location' },
      { path: 'serviceId', select: 'name category price' },
      { path: 'supplierId', select: 'name companyName profileImage' },
      { path: 'producerId', select: 'name companyName profileImage' }
    ]);

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
});

// @desc    Delete order
// @route   DELETE /api/orders/:id
// @access  Private (Order producer only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this order'
      });
    }

    // Only allow deletion of pending orders
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending orders can be deleted'
      });
    }

    await Order.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting order',
      error: error.message
    });
  }
});

// @desc    Confirm order (supplier)
// @route   PUT /api/orders/:id/confirm
// @access  Private (Order supplier only)
router.put('/:id/confirm', protect, authorize('supplier'), async (req, res) => {
  try {
    const { finalPrice, notes, availability } = req.body;

    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.supplierId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to confirm this order'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Order is not in pending status'
      });
    }

    // Update order
    order.status = 'confirmed';
    order.finalPrice = finalPrice;
    order.supplierNotes = notes;
    order.confirmedAt = new Date();
    
    if (availability) {
      order.availability = availability;
    }

    await order.save();

    // Populate related data
    await order.populate([
      { path: 'eventId', select: 'name startDate endDate location' },
      { path: 'serviceId', select: 'name category price' },
      { path: 'supplierId', select: 'name companyName profileImage' },
      { path: 'producerId', select: 'name companyName profileImage' }
    ]);

    res.json({
      success: true,
      message: 'Order confirmed successfully',
      data: order
    });
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming order',
      error: error.message
    });
  }
});

// @desc    Complete order
// @route   PUT /api/orders/:id/complete
// @access  Private (Order participants only)
router.put('/:id/complete', protect, async (req, res) => {
  try {
    const { completionNotes, rating } = req.body;

    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.producerId.toString() !== req.user._id.toString() && 
        order.supplierId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to complete this order'
      });
    }

    if (order.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Order is not in progress'
      });
    }

    // Update order
    order.status = 'completed';
    order.completedAt = new Date();
    
    if (completionNotes) {
      order.completionNotes = completionNotes;
    }
    
    if (rating && req.user.role === 'producer') {
      order.rating = rating;
    }

    await order.save();

    // Populate related data
    await order.populate([
      { path: 'eventId', select: 'name startDate endDate location' },
      { path: 'serviceId', select: 'name category price' },
      { path: 'supplierId', select: 'name companyName profileImage' },
      { path: 'producerId', select: 'name companyName profileImage' }
    ]);

    res.json({
      success: true,
      message: 'Order completed successfully',
      data: order
    });
  } catch (error) {
    console.error('Complete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing order',
      error: error.message
    });
  }
});

// @desc    Get order statistics
// @route   GET /api/orders/stats/me
// @access  Private
router.get('/stats/me', protect, async (req, res) => {
  try {
    let filter = {};
    
    if (req.user.role === 'producer') {
      filter.producerId = req.user._id;
    } else if (req.user.role === 'supplier') {
      filter.supplierId = req.user._id;
    }

    const stats = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$finalPrice' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments(filter);
    const completedOrders = await Order.countDocuments({ ...filter, status: 'completed' });
    const totalRevenue = await Order.aggregate([
      { $match: { ...filter, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$finalPrice' } } }
    ]);

    const response = {
      totalOrders,
      completedOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      statusBreakdown: stats.reduce((acc, stat) => {
        acc[stat._id] = { count: stat.count, value: stat.totalValue || 0 };
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order statistics',
      error: error.message
    });
  }
});

module.exports = router; 