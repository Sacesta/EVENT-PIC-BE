const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Event = require('../models/Event');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().optional(),
  language: Joi.string().valid('he', 'en', 'ar').optional(),
  profileImage: Joi.string().optional(),
  producerDetails: Joi.object({
    companyName: Joi.string().optional(),
    businessLicense: Joi.string().optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
    specializations: Joi.array().items(Joi.string()).optional()
  }).optional(),
  supplierDetails: Joi.object({
    companyName: Joi.string().optional(),
    businessLicense: Joi.string().optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    experience: Joi.string().valid('beginner', 'intermediate', 'expert').optional()
  }).optional()
});

const updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/users/me
// @access  Private
router.put('/me', protect, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      value,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

// @desc    Update user password
// @route   PUT /api/users/me/password
// @access  Private
router.put('/me/password', protect, async (req, res) => {
  try {
    // Validate input
    const { error, value } = updatePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { currentPassword, newPassword } = value;

    // Get user with password
    const user = await User.findById(req.user._id);
    
    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating password',
      error: error.message
    });
  }
});

// @desc    Search users
// @route   GET /api/users/search
// @access  Private
router.get('/search', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      city,
      experience,
      category,
      search,
      rating
    } = req.query;

    console.log("Current user : ",req.user._id);

    // Build filter object
    const filter = { isActive: true };
    
    // Determine target role based on current user's role
    let targetRole = role;
    
    if (req.user.role === 'supplier') {
      // Suppliers search for producers who have added them to events
      targetRole = 'producer';
      
      // Get all events where this supplier has been added
      const supplierEvents = await Event.find({ 
        'suppliers.supplierId': req.user._id 
      })
        .select('producerId')
        .lean();

      
      // Extract unique producer IDs from all events
      const producerIds = new Set();
      supplierEvents.forEach(event => {
        if (event.producerId) {
          producerIds.add(event.producerId.toString());
        }
      });
      
      // Convert Set to Array
      const producerIdsArray = Array.from(producerIds);
      
      // If no producers found in events, return empty results
      if (producerIdsArray.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalUsers: 0,
            hasNextPage: false,
            hasPrevPage: false
          },
          message: 'No producers have added you to their events yet'
        });
      }
      
      // Add producer IDs filter to only show producers who have added this supplier
      filter._id = { $in: producerIdsArray };
      
    } else if (req.user.role === 'producer') {
      // Producers search for suppliers they have worked with
      targetRole = 'supplier';
      
      // Get all events created by this producer
      const producerEvents = await Event.find({ producerId: req.user._id })
        .select('suppliers')
        .lean();


      // Extract unique supplier IDs from all events
      const supplierIds = new Set();
      producerEvents.forEach(event => {
        if (event.suppliers && event.suppliers.length > 0) {
          event.suppliers.forEach(supplier => {
            if (supplier.supplierId) {
              supplierIds.add(supplier.supplierId.toString());
            }
          });
        }
      });
      
      // Convert Set to Array
      const supplierIdsArray = Array.from(supplierIds);
      
      // If no suppliers found in events, return empty results
      if (supplierIdsArray.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalUsers: 0,
            hasNextPage: false,
            hasPrevPage: false
          },
          message: 'No suppliers found in your events'
        });
      }
      
      // Add supplier IDs filter to only show suppliers from producer's events
      filter._id = { $in: supplierIdsArray };
      
    } else if (req.user.role === 'admin') {
      // Admins can search any role (use query param or no filter)
      targetRole = role;
    }
    
    // Apply role filter if targetRole is determined
    if (targetRole) {
      filter.role = targetRole;
    }
    
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (experience && targetRole) {
      filter[`${targetRole}Details.experience`] = experience;
    }
    if (rating) filter.rating = { $gte: parseFloat(rating) };

    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { companyName: new RegExp(search, 'i') }
      ];
    }

    if (category && targetRole === 'supplier') {
      filter['supplierDetails.categories'] = category;
    }

    // Execute query with pagination
    const users = await User.find(filter)
      .select('-password -email')
      .sort({ rating: -1, createdAt: -1 })
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
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching users',
      error: error.message
    });
  }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -email')
      .populate('producerDetails.specializations')
      .populate('supplierDetails.categories');

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

// @desc    Get suppliers by category
// @route   GET /api/users/suppliers/category/:category
// @access  Public
router.get('/suppliers/category/:category', async (req, res) => {
  try {
    const { page = 1, limit = 10, city, experience, rating } = req.query;
    
    const filter = { 
      role: 'supplier',
      isActive: true,
      'supplierDetails.categories': req.params.category
    };
    
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (experience) filter['supplierDetails.experience'] = experience;
    if (rating) filter.rating = { $gte: parseFloat(rating) };

    const suppliers = await User.find(filter)
      .select('-password -email')
      .sort({ rating: -1, 'supplierDetails.experience': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: suppliers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalSuppliers: total
      }
    });
  } catch (error) {
    console.error('Get suppliers by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suppliers by category',
      error: error.message
    });
  }
});

// @desc    Get producers by specialization
// @route   GET /api/users/producers/specialization/:specialization
// @access  Public
router.get('/producers/specialization/:specialization', async (req, res) => {
  try {
    const { page = 1, limit = 10, city, experience, rating } = req.query;
    
    const filter = { 
      role: 'producer',
      isActive: true,
      'producerDetails.specializations': req.params.specialization
    };
    
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (experience) filter['producerDetails.experience'] = experience;
    if (rating) filter.rating = { $gte: parseFloat(rating) };

    const producers = await User.find(filter)
      .select('-password -email')
      .sort({ rating: -1, 'producerDetails.experience': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: producers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducers: total
      }
    });
  } catch (error) {
    console.error('Get producers by specialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching producers by specialization',
      error: error.message
    });
  }
});

// @desc    Get top rated users
// @route   GET /api/users/top-rated
// @access  Public
router.get('/top-rated', async (req, res) => {
  try {
    const { role, limit = 10 } = req.query;
    
    const filter = { isActive: true, rating: { $exists: true, $gt: 0 } };
    if (role) filter.role = role;

    const users = await User.find(filter)
      .select('-password -email')
      .sort({ rating: -1, reviewCount: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get top rated users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching top rated users',
      error: error.message
    });
  }
});

// @desc    Add user review
// @route   POST /api/users/:id/reviews
// @access  Private
router.post('/:id/reviews', protect, async (req, res) => {
  try {
    const { rating, comment, serviceId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot review yourself'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user already reviewed this user
    const existingReview = user.reviews.find(
      review => review.userId.toString() === req.user._id.toString()
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this user'
      });
    }

    // Add review
    user.reviews.push({
      userId: req.user._id,
      rating,
      comment,
      serviceId,
      createdAt: new Date()
    });

    // Recalculate average rating
    const totalRating = user.reviews.reduce((sum, review) => sum + review.rating, 0);
    user.rating = totalRating / user.reviews.length;
    user.reviewCount = user.reviews.length;

    await user.save();

    res.json({
      success: true,
      message: 'Review added successfully',
      data: {
        rating: user.rating,
        totalReviews: user.reviews.length
      }
    });
  } catch (error) {
    console.error('Add user review error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding review',
      error: error.message
    });
  }
});

// @desc    Get user reviews
// @route   GET /api/users/:id/reviews
// @access  Public
router.get('/:id/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const user = await User.findById(req.params.id)
      .select('reviews')
      .populate('reviews.userId', 'name profileImage');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Paginate reviews
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedReviews = user.reviews.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(user.reviews.length / limit),
        totalReviews: user.reviews.length
      }
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user reviews',
      error: error.message
    });
  }
});

// @desc    Deactivate user account
// @route   PUT /api/users/me/deactivate
// @access  Private
router.put('/me/deactivate', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isActive: false });

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating account',
      error: error.message
    });
  }
});

// @desc    Get supplier users
// @route   GET /api/users/suppliers
// @access  Public
router.get('/suppliers', async (req, res) => {
  try {
    const { 
      ids, 
      verified = true, 
      active = true, 
      limit = 50, 
      page = 1,
      city,
      search,
      minRating = 0
    } = req.query;

    // Build filter for supplier users
    const filter = {
      role: 'supplier',
      isActive: active === 'true' || active === true,
      isVerified: verified === 'true' || verified === true
    };

    // Filter by specific IDs if provided
    if (ids) {
      const idArray = ids.split(',').map(id => id.trim());
      filter._id = { $in: idArray };
    }

    // Add city filter if provided
    if (city) {
      filter['supplierDetails.location.city'] = new RegExp(city, 'i');
    }

    // Add rating filter if provided
    if (minRating) {
      filter['supplierDetails.rating.average'] = { $gte: parseFloat(minRating) };
    }

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { 'supplierDetails.companyName': new RegExp(search, 'i') },
        { 'supplierDetails.description': new RegExp(search, 'i') }
      ];
    }

    // Execute query with pagination
    const suppliers = await User.find(filter)
      .select('name email profileImage supplierDetails isVerified isActive createdAt phone')
      .sort({ 'supplierDetails.rating.average': -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: suppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) * parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get supplier users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier users',
      error: error.message
    });
  }
});

module.exports = router;
