const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Event = require('../models/Event');
const Service = require('../models/Service');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Admin-only middleware - apply to all routes
router.use(protect, authorize('admin'));

// Validation schemas
const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  password: Joi.string().min(6).optional(),
  role: Joi.string().valid('user', 'producer', 'supplier', 'admin').optional(),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  verificationStatus: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  companyName: Joi.string().max(100).optional(),
  phone: Joi.string().max(20).optional(),
  address: Joi.object({
    street: Joi.string().max(200).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    zipCode: Joi.string().max(20).optional(),
    country: Joi.string().max(100).optional()
  }).optional()
});

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('producer', 'supplier', 'admin').required(),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  verificationStatus: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  phone: Joi.string().max(20).optional(),
  producerDetails: Joi.object({
    companyName: Joi.string().allow('').optional(),
    businessLicense: Joi.string().allow('').optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
    specializations: Joi.array().items(Joi.string()).optional()
  }).optional(),
  supplierDetails: Joi.object({
    companyName: Joi.string().allow('').optional(),
    businessLicense: Joi.string().allow('').optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional()
  }).optional()
});

const updateEventSchema = Joi.object({
  status: Joi.string().valid('draft', 'published', 'cancelled', 'completed').optional(),
  isApproved: Joi.boolean().optional(),
  adminNotes: Joi.string().max(1000).optional()
});

const updateServiceSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
  isApproved: Joi.boolean().optional(),
  adminNotes: Joi.string().max(1000).optional()
});

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      verifiedUsers,
      pendingVerificationUsers,
      rejectedUsers,
      totalEvents,
      totalServices,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      recentUsers,
      recentOrders
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ verificationStatus: 'pending' }),
      User.countDocuments({ verificationStatus: 'rejected' }),
      Event.countDocuments(),
      Service.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'completed' }),
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$payment.amount' } } }
      ]),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt isVerified verificationStatus'),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('producerId', 'name').populate('supplierId', 'name')
    ]);

    const revenue = totalRevenue[0]?.total || 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          verifiedUsers,
          pendingVerificationUsers,
          rejectedUsers,
          totalEvents,
          totalServices,
          totalOrders,
          pendingOrders,
          completedOrders,
          totalRevenue: revenue
        },
        recentActivity: {
          recentUsers,
          recentOrders
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
});

// @desc    Create new user (Admin only)
// @route   POST /api/admin/users
// @access  Private (Admin only)
router.post('/users', async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: value.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user with admin privileges
    const user = await User.create({
      ...value,
      isVerified: value.isVerified || false,
      verificationStatus: value.verificationStatus || 'pending',
      isActive: value.isActive !== undefined ? value.isActive : true
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (role) filter.role = role;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'verified') filter.isVerified = true;
    if (status === 'unverified') filter.isVerified = false;
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const users = await User.find(filter)
      .select('-password')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private (Admin only)
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin only)
router.put('/users/:id', async (req, res) => {
  try {
    console.log('Admin update user - Raw request body:', req.body);
    console.log('Admin update user - Request headers:', req.headers);
    
    // Validate input
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      console.log('Admin update user - Validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Get the current user to track changes
    const currentUser = await User.findById(req.params.id).select('isVerified verificationStatus name email');
    
    console.log('Admin update user - Current user:', {
      id: currentUser?._id,
      isVerified: currentUser?.isVerified,
      verificationStatus: currentUser?.verificationStatus
    });
    console.log('Admin update user - Update data:', value);
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true }
    ).select('-password');
    
    console.log('Admin update user - Updated user:', {
      id: user?._id,
      isVerified: user?.isVerified,
      verificationStatus: user?.verificationStatus
    });
    
    // Double-check by fetching the user again
    const doubleCheckUser = await User.findById(req.params.id).select('isVerified verificationStatus');
    console.log('Admin update user - Double check user:', {
      id: doubleCheckUser?._id,
      isVerified: doubleCheckUser?.isVerified,
      verificationStatus: doubleCheckUser?.verificationStatus
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log verification status changes and send email notifications for suppliers
    if (currentUser && (value.isVerified !== undefined || value.verificationStatus !== undefined)) {
      const verificationChanged = currentUser.isVerified !== user.isVerified || 
                                 currentUser.verificationStatus !== user.verificationStatus;
      
      if (verificationChanged) {
        console.log(`Admin ${req.user.email} updated user ${user.email} verification:`, {
          userId: user._id,
          userName: user.name,
          previousStatus: {
            isVerified: currentUser.isVerified,
            verificationStatus: currentUser.verificationStatus
          },
          newStatus: {
            isVerified: user.isVerified,
            verificationStatus: user.verificationStatus
          },
          timestamp: new Date().toISOString()
        });

        // Send email notifications for supplier approval/rejection
        if (user.role === 'supplier') {
          try {
            if (user.verificationStatus === 'approved' && user.isVerified) {
              // Send approval email
              await emailService.sendSupplierApprovalEmail(user);
              console.log(`Supplier approval email sent to ${user.email}`);
            } else if (user.verificationStatus === 'rejected') {
              // Send rejection email with admin notes as reason
              const reason = value.adminNotes || req.body.adminNotes || '';
              await emailService.sendSupplierRejectionEmail(user, reason);
              console.log(`Supplier rejection email sent to ${user.email}`);
            }
          } catch (emailError) {
            console.error('Failed to send supplier notification email:', emailError);
            // Don't fail the request if email fails, just log the error
          }
        }
      }
    }

    // Determine the appropriate success message
    let message = 'User updated successfully';
    if (value.isVerified !== undefined || value.verificationStatus !== undefined) {
      if (user.isVerified && user.verificationStatus === 'approved') {
        message = 'User approved and verified successfully';
      } else if (user.verificationStatus === 'rejected') {
        message = 'User verification rejected successfully';
      } else if (user.verificationStatus === 'pending') {
        message = 'User verification status reset to pending';
      }
    }

    res.json({
      success: true,
      message,
      data: user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has active orders
    const activeOrders = await Order.countDocuments({
      $or: [
        { producerId: user._id, status: { $nin: ['cancelled', 'completed'] } },
        { supplierId: user._id, status: { $nin: ['cancelled', 'completed'] } }
      ]
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user with active orders'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

// @desc    Get all events with filtering and pagination
// @route   GET /api/admin/events
// @access  Private (Admin only)
router.get('/events', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      isApproved,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (isApproved !== undefined) filter.isApproved = isApproved === 'true';
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const events = await Event.find(filter)
      .populate('producerId', 'name companyName')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Event.countDocuments(filter);

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEvents: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
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

// @desc    Update event
// @route   PUT /api/admin/events/:id
// @access  Private (Admin only)
router.put('/events/:id', async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateEventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true }
    ).populate('producerId', 'name companyName');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: event
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

// @desc    Get all services with filtering and pagination
// @route   GET /api/admin/services
// @access  Private (Admin only)
router.get('/services', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      isApproved,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (isApproved !== undefined) filter.isApproved = isApproved === 'true';
    if (category) filter.category = category;
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const services = await Service.find(filter)
      .populate('supplierId', 'name companyName')
      .sort(sort)
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
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services',
      error: error.message
    });
  }
});

// @desc    Update service
// @route   PUT /api/admin/services/:id
// @access  Private (Admin only)
router.put('/services/:id', async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateServiceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      value,
      { new: true, runValidators: true }
    ).populate('supplierId', 'name companyName');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: service
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service',
      error: error.message
    });
  }
});

// @desc    Get all orders with filtering and pagination
// @route   GET /api/admin/orders
// @access  Private (Admin only)
router.get('/orders', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    if (search) {
      filter.$or = [
        { 'eventDetails.eventName': { $regex: search, $options: 'i' } },
        { 'eventDetails.eventLocation': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const orders = await Order.find(filter)
      .populate('eventId', 'name startDate endDate location')
      .populate('serviceId', 'name category')
      .populate('supplierId', 'name companyName')
      .populate('producerId', 'name companyName')
      .sort(sort)
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

// @desc    Get user statistics
// @route   GET /api/admin/users/stats
// @access  Private (Admin only)
router.get('/users/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const [
      totalUsers,
      verifiedUsers,
      pendingUsers,
      rejectedUsers,
      activeUsers,
      inactiveUsers,
      roleBreakdown,
      verificationTrends
    ] = await Promise.all([
      User.countDocuments(matchStage),
      User.countDocuments({ ...matchStage, isVerified: true }),
      User.countDocuments({ ...matchStage, verificationStatus: 'pending' }),
      User.countDocuments({ ...matchStage, verificationStatus: 'rejected' }),
      User.countDocuments({ ...matchStage, isActive: true }),
      User.countDocuments({ ...matchStage, isActive: false }),
      User.aggregate([
        { $match: matchStage },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              verificationStatus: '$verificationStatus'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    const response = {
      totalUsers,
      verificationStats: {
        verified: verifiedUsers,
        pending: pendingUsers,
        rejected: rejectedUsers,
        verificationRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(2) : 0
      },
      statusStats: {
        active: activeUsers,
        inactive: inactiveUsers,
        activeRate: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(2) : 0
      },
      roleBreakdown: roleBreakdown.reduce((acc, role) => {
        acc[role._id] = role.count;
        return acc;
      }, {}),
      verificationTrends
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message
    });
  }
});

// @desc    Get order statistics
// @route   GET /api/admin/orders/stats
// @access  Private (Admin only)
router.get('/orders/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$payment.amount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments(matchStage);
    const totalRevenue = await Order.aggregate([
      { $match: { ...matchStage, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } }
    ]);

    const response = {
      totalOrders,
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

// @desc    Suspend/activate user
// @route   PUT /api/admin/users/:id/toggle-status
// @access  Private (Admin only)
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'suspended'} successfully`,
      data: { isActive: user.isActive }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling user status',
      error: error.message
    });
  }
});

// @desc    Approve/reject event
// @route   PUT /api/admin/events/:id/approve
// @access  Private (Admin only)
router.put('/events/:id/approve', async (req, res) => {
  try {
    const { isApproved, adminNotes } = req.body;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { 
        isApproved, 
        adminNotes,
        status: isApproved ? 'published' : 'draft'
      },
      { new: true, runValidators: true }
    ).populate('producerId', 'name companyName');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      message: `Event ${isApproved ? 'approved' : 'rejected'} successfully`,
      data: event
    });
  } catch (error) {
    console.error('Approve event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving event',
      error: error.message
    });
  }
});

// @desc    Approve/reject service
// @route   PUT /api/admin/services/:id/approve
// @access  Private (Admin only)
router.put('/services/:id/approve', async (req, res) => {
  try {
    const { isApproved, adminNotes } = req.body;

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { 
        isApproved, 
        adminNotes,
        status: isApproved ? 'active' : 'inactive'
      },
      { new: true, runValidators: true }
    ).populate('supplierId', 'name companyName');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: `Service ${isApproved ? 'approved' : 'rejected'} successfully`,
      data: service
    });
  } catch (error) {
    console.error('Approve service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving service',
      error: error.message
    });
  }
});

module.exports = router; 