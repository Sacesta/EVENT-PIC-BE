const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'Event ID is required']
  },
  eventName: {
    type: String,
    required: [true, 'Event name is required']
  },
  title: {
    type: String,
    required: [true, 'Ticket title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  type: {
    type: String,
    required: [true, 'Ticket type is required'],
    enum: ['vip', 'regular', 'early_bird', 'student', 'senior', 'child', 'custom']
  },
  price: {
    amount: {
      type: Number,
      required: [true, 'Price amount is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      enum: ['ILS', 'USD', 'EUR'],
      default: 'ILS'
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative']
    },
    discount: {
      type: Number,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%']
    }
  },
  quantity: {
    total: {
      type: Number,
      required: [true, 'Total quantity is required'],
      min: [1, 'Total quantity must be at least 1']
    },
    available: {
      type: Number,
      required: [true, 'Available quantity is required'],
      min: [0, 'Available quantity cannot be negative']
    },
    sold: {
      type: Number,
      default: 0,
      min: [0, 'Sold quantity cannot be negative']
    },
    reserved: {
      type: Number,
      default: 0,
      min: [0, 'Reserved quantity cannot be negative']
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'sold_out', 'expired', 'cancelled'],
    default: 'draft'
  },
  validity: {
    startDate: {
      type: Date,
      required: [true, 'Start date is required']
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  features: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    included: {
      type: Boolean,
      default: true
    }
  }],
  restrictions: {
    ageLimit: {
      min: {
        type: Number,
        min: [0, 'Minimum age cannot be negative']
      },
      max: {
        type: Number,
        min: [0, 'Maximum age cannot be negative']
      }
    },
    maxPerPerson: {
      type: Number,
      default: 10,
      min: [1, 'Maximum per person must be at least 1']
    },
    requiresId: {
      type: Boolean,
      default: false
    },
    specialRequirements: String
  },
  sales: {
    startDate: {
      type: Date,
      required: [true, 'Sales start date is required']
    },
    endDate: {
      type: Date,
      required: [true, 'Sales end date is required']
    },
    earlyBirdEndDate: Date,
    lastMinuteStartDate: Date
  },
  refundPolicy: {
    allowed: {
      type: Boolean,
      default: true
    },
    deadline: {
      type: Number, // days before event
      default: 7,
      min: [0, 'Refund deadline cannot be negative']
    },
    fee: {
      type: Number,
      default: 0,
      min: [0, 'Refund fee cannot be negative']
    }
  },
  imageForPdf: {
    type: String,
    default: null
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
    activatedAt: Date,
    pausedAt: Date,
    soldOutAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
ticketSchema.index({ eventId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ type: 1 });
ticketSchema.index({ 'validity.startDate': 1 });
ticketSchema.index({ 'validity.endDate': 1 });
ticketSchema.index({ 'sales.startDate': 1 });
ticketSchema.index({ 'sales.endDate': 1 });
ticketSchema.index({ 'price.amount': 1 });

// Compound indexes for common queries
ticketSchema.index({ eventId: 1, status: 1 });
ticketSchema.index({ eventId: 1, type: 1 });
ticketSchema.index({ status: 1, 'validity.isActive': 1 });

// Virtual for remaining quantity
ticketSchema.virtual('remainingQuantity').get(function() {
  return this.quantity.available - this.quantity.sold - this.quantity.reserved;
});

// Virtual for sold percentage
ticketSchema.virtual('soldPercentage').get(function() {
  if (this.quantity.total === 0) return 0;
  return Math.round((this.quantity.sold / this.quantity.total) * 100);
});

// Virtual for current price (with discount)
ticketSchema.virtual('currentPrice').get(function() {
  if (this.price.discount > 0) {
    return this.price.amount * (1 - this.price.discount / 100);
  }
  return this.price.amount;
});

// Virtual for savings amount
ticketSchema.virtual('savingsAmount').get(function() {
  if (this.price.originalPrice && this.price.originalPrice > this.price.amount) {
    return this.price.originalPrice - this.price.amount;
  }
  return 0;
});

// Virtual for is on sale
ticketSchema.virtual('isOnSale').get(function() {
  const now = new Date();
  return now >= this.sales.startDate && now <= this.sales.endDate;
});

// Virtual for is early bird
ticketSchema.virtual('isEarlyBird').get(function() {
  if (!this.sales.earlyBirdEndDate) return false;
  const now = new Date();
  return now <= this.sales.earlyBirdEndDate;
});

// Virtual for is last minute
ticketSchema.virtual('isLastMinute').get(function() {
  if (!this.sales.lastMinuteStartDate) return false;
  const now = new Date();
  return now >= this.sales.lastMinuteStartDate;
});

// Virtual for full image URL
ticketSchema.virtual('imageUrl').get(function() {
  if (this.imageForPdf) {
    return this.imageForPdf.startsWith('http') 
      ? this.imageForPdf 
      : `${process.env.BASE_URL}/uploads/${this.imageForPdf}`;
  }
  return null;
});

// Virtual to populate event details
ticketSchema.virtual('event', {
  ref: 'Event',
  localField: 'eventId',
  foreignField: '_id',
  justOne: true
});

// Virtual for event producer (useful for authorization)
ticketSchema.virtual('eventProducer', {
  ref: 'User',
  localField: 'eventId',
  foreignField: '_id',
  justOne: true,
  options: { select: 'producerId' }
});

// Pre-save middleware to update metadata
ticketSchema.pre('save', function(next) {
  this.metadata.updatedAt = new Date();
  
  if (this.isModified('status')) {
    if (this.status === 'active' && !this.metadata.activatedAt) {
      this.metadata.activatedAt = new Date();
    } else if (this.status === 'paused' && !this.metadata.pausedAt) {
      this.metadata.pausedAt = new Date();
    } else if (this.status === 'sold_out' && !this.metadata.soldOutAt) {
      this.metadata.soldOutAt = new Date();
    }
  }
  
  // Auto-update status based on quantity
  if (this.quantity.available <= 0) {
    this.status = 'sold_out';
  } else if (this.status === 'sold_out' && this.quantity.available > 0) {
    this.status = 'active';
  }
  
  // Auto-update validity.isActive
  const now = new Date();
  this.validity.isActive = now >= this.validity.startDate && now <= this.validity.endDate;
  
  next();
});

// Post-save middleware to update event ticketInfo
ticketSchema.post('save', async function() {
  try {
    const Event = mongoose.model('Event');
    await Event.findByIdAndUpdate(this.eventId, {}, { new: true })
      .then(event => event?.updateTicketInfo());
  } catch (error) {
    console.error('Error updating event ticketInfo:', error);
  }
});

// Static method to find active tickets
ticketSchema.statics.findActive = function() {
  return this.find({
    status: 'active',
    'validity.isActive': true
  }).sort({ 'sales.startDate': 1 });
};

// Static method to find tickets by event
ticketSchema.statics.findByEvent = function(eventId) {
  return this.find({ eventId }).sort({ 'price.amount': 1 });
};

// Static method to find tickets by type
ticketSchema.statics.findByType = function(type) {
  return this.find({
    type,
    status: 'active',
    'validity.isActive': true
  }).sort({ 'price.amount': 1 });
};

// Method to reserve tickets
ticketSchema.methods.reserveTickets = function(quantity) {
  if (quantity > this.quantity.available - this.quantity.sold - this.quantity.reserved) {
    throw new Error('Not enough tickets available for reservation');
  }
  
  this.quantity.reserved += quantity;
  return this.save();
};

// Method to release reserved tickets
ticketSchema.methods.releaseReservedTickets = function(quantity) {
  if (quantity > this.quantity.reserved) {
    throw new Error('Cannot release more tickets than reserved');
  }
  
  this.quantity.reserved -= quantity;
  return this.save();
};

// Method to sell tickets
ticketSchema.methods.sellTickets = function(quantity) {
  if (quantity > this.quantity.available - this.quantity.sold) {
    throw new Error('Not enough tickets available for sale');
  }
  
  this.quantity.sold += quantity;
  return this.save();
};

// Method to update price
ticketSchema.methods.updatePrice = function(newAmount, newDiscount = 0) {
  this.price.amount = newAmount;
  this.price.discount = newDiscount;
  
  if (newDiscount > 0 && !this.price.originalPrice) {
    this.price.originalPrice = newAmount;
  }
  
  return this.save();
};

module.exports = mongoose.model('Ticket', ticketSchema); 