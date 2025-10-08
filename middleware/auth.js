const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {

  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {

      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed'
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, please login'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Require approved supplier status for supplier-specific routes
const requireApprovedSupplier = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, please login'
    });
  }

  // Only check verification for suppliers
  if (req.user.role === 'supplier') {
    if (req.user.verificationStatus === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your supplier account is pending admin approval. Please wait for verification.',
        errorType: 'SUPPLIER_PENDING_VERIFICATION'
      });
    }
    
    if (req.user.verificationStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'Your supplier account has been rejected. Please contact support.',
        errorType: 'SUPPLIER_VERIFICATION_REJECTED'
      });
    }
    
    if (req.user.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your supplier account requires admin approval.',
        errorType: 'SUPPLIER_NOT_APPROVED'
      });
    }
  }

  next();
};

// Check if user owns the resource (for producers and suppliers)
const checkOwnership = (resourceModel) => {
  return async (req, res, next) => {
    try {
      const resource = await resourceModel.findById(req.params.id);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      // Admin can access everything
      if (req.user.role === 'admin') {
        req.resource = resource;
        return next();
      }

      // Check ownership based on resource type
      let isOwner = false;
      
      if (resourceModel.modelName === 'Event') {
        isOwner = resource.producerId.toString() === req.user._id.toString();
      } else if (resourceModel.modelName === 'Service') {
        isOwner = resource.supplierId.toString() === req.user._id.toString();
      } else if (resourceModel.modelName === 'Order') {
        isOwner = resource.producerId.toString() === req.user._id.toString() || 
                  resource.supplierId.toString() === req.user._id.toString();
      }

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this resource'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership'
      });
    }
  };
};

module.exports = {
  protect,
  authorize,
  requireApprovedSupplier,
  checkOwnership
};
