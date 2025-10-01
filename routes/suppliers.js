const express = require('express');
const User = require('../models/User');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all suppliers with optional filtering
// @route   GET /api/suppliers
// @access  Public
router.get('/', async (req, res) => {
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
      active = true
    } = req.query;

    // Build base filter for suppliers
    const supplierFilter = {
      role: 'supplier',
      isActive: active === 'true' || active === true,
      isVerified: verified === 'true' || verified === true
    };

    // Add rating filter if provided
    if (minRating) {
      supplierFilter['supplierDetails.rating.average'] = { $gte: parseFloat(minRating) };
    }

    // Add city filter if provided
    if (city) {
      supplierFilter['supplierDetails.location.city'] = new RegExp(city, 'i');
    }

    // Add search filter if provided
    if (search) {
      supplierFilter.$or = [
        { name: new RegExp(search, 'i') },
        { 'supplierDetails.companyName': new RegExp(search, 'i') },
        { 'supplierDetails.description': new RegExp(search, 'i') }
      ];
    }

    // If category or maxPrice is specified, we need to filter by services
    let supplierIds = null;
    if (category || maxPrice) {
      const serviceFilter = {
        status: 'active',
        available: true
      };

      if (category) serviceFilter.category = category;
      if (maxPrice) serviceFilter['price.amount'] = { $lte: parseFloat(maxPrice) };

      const services = await Service.find(serviceFilter).distinct('supplierId');
      supplierIds = services;
      supplierFilter._id = { $in: supplierIds };
    }

    // Execute query with pagination
    const suppliers = await User.find(supplierFilter)
      .select('name email profileImage supplierDetails isVerified isActive createdAt')
      .sort({ 'supplierDetails.rating.average': -1, createdAt: -1 })
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
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suppliers',
      error: error.message
    });
  }
});

// @desc    Get suppliers with their services included
// @route   GET /api/suppliers/with-services
// @access  Public
router.get('/with-services', async (req, res) => {
  try {
    const { 
      category, 
      city, 
      maxPrice, 
      minPrice,
      minRating = 0, 
      limit = 50, 
      page = 1,
      search
    } = req.query;

    // Build base filter for suppliers
    const supplierFilter = {
      role: 'supplier',
      isVerified: true,
      isActive: true
    };

    // Add rating filter if provided
    if (minRating) {
      supplierFilter['supplierDetails.rating.average'] = { $gte: parseFloat(minRating) };
    }

    // Add city filter if provided
    if (city) {
      supplierFilter['supplierDetails.location.city'] = new RegExp(city, 'i');
    }

    // Add search filter if provided
    if (search) {
      supplierFilter.$or = [
        { name: new RegExp(search, 'i') },
        { 'supplierDetails.companyName': new RegExp(search, 'i') },
        { 'supplierDetails.description': new RegExp(search, 'i') }
      ];
    }

    // Get suppliers
    const suppliers = await User.find(supplierFilter)
      .select('name email profileImage supplierDetails isVerified isActive createdAt')
      .sort({ 'supplierDetails.rating.average': -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Build service filter
    const serviceFilter = {
      status: 'active',
      available: true,
      supplierId: { $in: suppliers.map(s => s._id) }
    };

    if (category) serviceFilter.category = category;
    if (maxPrice) serviceFilter['price.amount'] = { $lte: parseFloat(maxPrice) };
    if (minPrice) serviceFilter['price.amount'] = { 
      ...serviceFilter['price.amount'], 
      $gte: parseFloat(minPrice) 
    };

    // Get services for these suppliers
    const services = await Service.find(serviceFilter)
      .select('supplierId title description category price packages rating location available')
      .sort({ 'rating.average': -1, 'price.amount': 1 });

    // Group services by supplier
    const servicesBySupplier = services.reduce((acc, service) => {
      const supplierId = service.supplierId.toString();
      if (!acc[supplierId]) acc[supplierId] = [];
      acc[supplierId].push(service);
      return acc;
    }, {});

    // Filter suppliers who have matching services and add services to them
    const suppliersWithServices = suppliers
      .filter(supplier => servicesBySupplier[supplier._id.toString()])
      .map(supplier => ({
        ...supplier.toObject(),
        services: servicesBySupplier[supplier._id.toString()] || []
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
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get suppliers with services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suppliers with services',
      error: error.message
    });
  }
});

// @desc    Get single supplier with services
// @route   GET /api/suppliers/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const supplier = await User.findOne({
      _id: req.params.id,
      role: 'supplier',
      isActive: true
    }).select('name email profileImage supplierDetails isVerified isActive createdAt');

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Get supplier's services
    const services = await Service.find({
      supplierId: supplier._id,
      status: 'active',
      available: true
    }).sort({ 'rating.average': -1, createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...supplier.toObject(),
        services
      }
    });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier',
      error: error.message
    });
  }
});

// @desc    Get supplier services
// @route   GET /api/suppliers/:id/services
// @access  Public
router.get('/:id/services', async (req, res) => {
  try {
    const { category, available = true } = req.query;

    // Verify supplier exists
    const supplier = await User.findOne({
      _id: req.params.id,
      role: 'supplier',
      isActive: true
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Build service filter
    const serviceFilter = {
      supplierId: req.params.id,
      status: 'active'
    };

    if (category) serviceFilter.category = category;
    if (available !== undefined) serviceFilter.available = available === 'true';

    // Get services
    const services = await Service.find(serviceFilter)
      .sort({ 'rating.average': -1, createdAt: -1 });

    res.json({
      success: true,
      data: services,
      count: services.length
    });
  } catch (error) {
    console.error('Get supplier services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier services',
      error: error.message
    });
  }
});

module.exports = router;
