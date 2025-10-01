const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true,
    maxlength: [200, 'Event name cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Event description is required'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  image: {
    type: String,
    default: null
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Start date must be in the future'
    }
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  location: {
    address: {
      type: String,
      required: [true, 'Event address is required']
    },
    city: {
      type: String,
      required: [true, 'City is required']
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90
      },
      lng: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },
  language: {
    type: String,
    enum: ['he', 'en', 'ar'],
    required: [true, 'Language is required'],
    default: 'he'
  },
  category: {
    type: String,
    required: [true, 'Event category is required'],
    enum: [
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
    ]
  },
  requiredServices: [{
    type: String,
    enum: [
      'photography', 'videography', 'catering', 'music', 
      'decoration', 'transportation', 'security',  'lighting' , 'sound', 'furniture', 'tents', 'other'
    ]
  }],
  // Enhanced suppliers structure to support multiple services per supplier
  suppliers: [{
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true
    },
    // Selected package ID from the service's packages array
    selectedPackageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    // Store package details snapshot at time of selection
    packageDetails: {
      name: String,
      description: String,
      price: Number,
      features: [String],
      duration: Number
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'cancelled', 'rejected'],
      default: 'pending'
    },
    requestedPrice: {
      type: Number,
      min: 0
    },
    finalPrice: {
      type: Number,
      min: 0
    },
    notes: {
      type: String,
      maxlength: 500
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    confirmedAt: Date,
    completedAt: Date,
    // Communication thread
    messages: [{
      from: {
        type: String,
        enum: ['producer', 'supplier'],
        required: true
      },
      message: {
        type: String,
        required: true,
        maxlength: 1000
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      read: {
        type: Boolean,
        default: false
      }
    }],
    // Contract/Agreement details
    contract: {
      terms: String,
      deliverables: [String],
      deadlines: [{
        task: String,
        date: Date,
        completed: {
          type: Boolean,
          default: false
        }
      }],
      paymentTerms: {
        amount: Number,
        schedule: String, // 'upfront', '50-50', 'on-completion'
        dueDate: Date
      }
    }
  }],
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Producer ID is required']
  },
  status: {
    type: String,
    enum: ['draft', 'approved', 'rejected', 'completed'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  ticketInfo: {
    availableTickets: {
      type: Number,
      required: [true, 'Available tickets count is required'],
      min: [0, 'Available tickets cannot be negative']
    },
    soldTickets: {
      type: Number,
      default: 0,
      min: [0, 'Sold tickets cannot be negative']
    },
    reservedTickets: {
      type: Number,
      default: 0,
      min: [0, 'Reserved tickets cannot be negative']
    },
    priceRange: {
      min: {
        type: Number,
        min: [0, 'Minimum price cannot be negative']
      },
      max: {
        type: Number,
        min: [0, 'Maximum price cannot be negative']
      }
    }
  },
  // Budget management
  budget: {
    total: {
      type: Number,
      min: 0
    },
    allocated: {
      type: Map,
      of: Number, // Service category -> allocated amount
      default: {}
    },
    spent: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  tags: [String],
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Analytics and insights
  analytics: {
    supplierRequests: {
      type: Number,
      default: 0
    },
    supplierConfirmations: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number, // in hours
      default: 0
    },
    totalServicesCost: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    publishedAt: Date,
    cancelledAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
eventSchema.index({ producerId: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ endDate: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ language: 1 });
eventSchema.index({ 'location.city': 1 });
eventSchema.index({ 'location.coordinates': '2dsphere' });
eventSchema.index({ isPublic: 1, status: 1 });
eventSchema.index({ featured: 1, status: 1 });
eventSchema.index({ 'suppliers.supplierId': 1 });
eventSchema.index({ 'suppliers.serviceId': 1 });
eventSchema.index({ 'suppliers.status': 1 });

// Compound indexes for better query performance
eventSchema.index({ status: 1, isPublic: 1, startDate: 1 });
eventSchema.index({ category: 1, 'location.city': 1, status: 1 });

// Virtual for event duration
eventSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Virtual for remaining tickets
eventSchema.virtual('remainingTickets').get(function() {
  return this.ticketInfo.availableTickets - this.ticketInfo.soldTickets - this.ticketInfo.reservedTickets;
});

// Virtual for event status
eventSchema.virtual('isUpcoming').get(function() {
  return this.startDate > new Date();
});

// Virtual for full image URL
eventSchema.virtual('imageUrl').get(function() {
  if (this.image) {
    return this.image.startsWith('http') 
      ? this.image 
      : `${process.env.BASE_URL}/uploads/${this.image}`;
  }
  return null;
});

// Virtual to populate tickets for this event
eventSchema.virtual('tickets', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'eventId'
});

// Virtual for supplier statistics
eventSchema.virtual('supplierStats').get(function() {
  const suppliers = this.suppliers || [];
  const uniqueSuppliers = [...new Set(suppliers.map(s => s.supplierId?.toString()))];
  
  return {
    totalSuppliers: uniqueSuppliers.length,
    totalServices: suppliers.length,
    confirmedServices: suppliers.filter(s => s.status === 'confirmed').length,
    pendingServices: suppliers.filter(s => s.status === 'pending').length,
    cancelledServices: suppliers.filter(s => s.status === 'cancelled').length,
    rejectedServices: suppliers.filter(s => s.status === 'rejected').length
  };
});

// Virtual for budget utilization
eventSchema.virtual('budgetUtilization').get(function() {
  if (!this.budget?.total) return null;
  
  const confirmedCost = this.suppliers
    .filter(s => s.status === 'confirmed' && s.finalPrice)
    .reduce((sum, s) => sum + s.finalPrice, 0);
    
  return {
    total: this.budget.total,
    committed: confirmedCost,
    remaining: this.budget.total - confirmedCost,
    utilizationPercentage: (confirmedCost / this.budget.total) * 100
  };
});

// Pre-save middleware to update metadata and analytics
eventSchema.pre('save', function(next) {
  this.metadata.updatedAt = new Date();
  
  if (this.isModified('status')) {
    if (this.status === 'published' && !this.metadata.publishedAt) {
      this.metadata.publishedAt = new Date();
    } else if (this.status === 'cancelled' && !this.metadata.cancelledAt) {
      this.metadata.cancelledAt = new Date();
    }
  }
  
  // Update analytics
  if (this.isModified('suppliers')) {
    this.analytics.supplierRequests = this.suppliers.length;
    this.analytics.supplierConfirmations = this.suppliers.filter(s => s.status === 'confirmed').length;
    this.analytics.totalServicesCost = this.suppliers
      .filter(s => s.status === 'confirmed' && s.finalPrice)
      .reduce((sum, s) => sum + s.finalPrice, 0);
  }
  
  next();
});

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function() {
  return this.find({
    startDate: { $gt: new Date() },
    status: 'published',
    isPublic: true
  }).sort({ startDate: 1 });
};

// Static method to find events by category
eventSchema.statics.findByCategory = function(category) {
  return this.find({
    category,
    status: 'published',
    isPublic: true
  }).sort({ startDate: 1 });
};

// Static method to find events by location
eventSchema.statics.findByLocation = function(city) {
  return this.find({
    'location.city': new RegExp(city, 'i'),
    status: 'published',
    isPublic: true
  }).sort({ startDate: 1 });
};

// Enhanced method to add supplier with detailed information including package
eventSchema.methods.addSupplierWithDetails = function(supplierId, serviceId, details = {}) {
  const existingSupplier = this.suppliers.find(
    s => s.supplierId.toString() === supplierId.toString() && 
         s.serviceId.toString() === serviceId.toString()
  );
  
  if (existingSupplier) {
    throw new Error('Supplier already added for this service');
  }
  
  const supplierData = {
    supplierId,
    serviceId,
    status: 'pending',
    requestedPrice: details.requestedPrice,
    notes: details.notes,
    priority: details.priority || 'medium',
    requestedAt: new Date()
  };
  
  // Add package information if provided
  if (details.selectedPackageId) {
    supplierData.selectedPackageId = details.selectedPackageId;
  }
  
  if (details.packageDetails) {
    supplierData.packageDetails = details.packageDetails;
  }
  
  this.suppliers.push(supplierData);
  
  return this.save();
};

// Method to update supplier status with additional details
eventSchema.methods.updateSupplierStatus = function(supplierId, serviceId, status, details = {}) {
  const supplier = this.suppliers.find(
    s => s.supplierId.toString() === supplierId.toString() && 
         s.serviceId.toString() === serviceId.toString()
  );
  
  if (!supplier) {
    throw new Error('Supplier not found for this service');
  }
  
  supplier.status = status;
  
  if (status === 'confirmed') {
    supplier.confirmedAt = new Date();
    if (details.finalPrice) {
      supplier.finalPrice = details.finalPrice;
    }
    if (details.contract) {
      supplier.contract = details.contract;
    }
  }
  
  if (status === 'completed') {
    supplier.completedAt = new Date();
  }
  
  return this.save();
};

// Method to remove supplier service
eventSchema.methods.removeSupplier = function(supplierId, serviceId) {
  const supplierIndex = this.suppliers.findIndex(
    s => s.supplierId.toString() === supplierId.toString() && 
         s.serviceId.toString() === serviceId.toString()
  );
  
  if (supplierIndex === -1) {
    throw new Error('Supplier not found for this service');
  }
  
  this.suppliers.splice(supplierIndex, 1);
  return this.save();
};

// Method to add message to supplier communication thread
eventSchema.methods.addSupplierMessage = function(supplierId, serviceId, from, message) {
  const supplier = this.suppliers.find(
    s => s.supplierId.toString() === supplierId.toString() && 
         s.serviceId.toString() === serviceId.toString()
  );
  
  if (!supplier) {
    throw new Error('Supplier not found for this service');
  }
  
  supplier.messages.push({
    from,
    message,
    timestamp: new Date(),
    read: false
  });
  
  return this.save();
};

// Method to get suppliers grouped by supplier ID
eventSchema.methods.getGroupedSuppliers = function() {
  return this.suppliers.reduce((acc, supplier) => {
    const supplierId = supplier.supplierId.toString();
    if (!acc[supplierId]) {
      acc[supplierId] = {
        supplierId: supplier.supplierId,
        services: []
      };
    }
    acc[supplierId].services.push({
      serviceId: supplier.serviceId,
      status: supplier.status,
      requestedPrice: supplier.requestedPrice,
      finalPrice: supplier.finalPrice,
      notes: supplier.notes,
      priority: supplier.priority,
      confirmedAt: supplier.confirmedAt,
      messages: supplier.messages || []
    });
    return acc;
  }, {});
};

// Method to calculate total confirmed services cost
eventSchema.methods.getTotalConfirmedCost = function() {
  return this.suppliers
    .filter(s => s.status === 'confirmed' && s.finalPrice)
    .reduce((sum, s) => sum + s.finalPrice, 0);
};

// Method to get services by status
eventSchema.methods.getServicesByStatus = function(status) {
  return this.suppliers.filter(s => s.status === status);
};

// Method to get services by priority
eventSchema.methods.getServicesByPriority = function(priority) {
  return this.suppliers.filter(s => s.priority === priority);
};

// Method to update budget allocation
eventSchema.methods.updateBudgetAllocation = function(allocations) {
  if (!this.budget) {
    this.budget = { allocated: new Map() };
  }
  
  Object.entries(allocations).forEach(([category, amount]) => {
    this.budget.allocated.set(category, amount);
  });
  
  return this.save();
};

module.exports = mongoose.model('Event', eventSchema);