const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'Event ID is required']
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: [true, 'Service ID is required']
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Supplier ID is required']
  },
  producerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Producer ID is required']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  orderDetails: {
    quantity: {
      type: Number,
      default: 1,
      min: [1, 'Quantity must be at least 1']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative']
    },
    currency: {
      type: String,
      enum: ['ILS', 'USD', 'EUR'],
      default: 'ILS'
    },
    customRequirements: String,
    specialInstructions: String
  },
  eventDetails: {
    eventName: String,
    eventDate: Date,
    eventLocation: String,
    eventDuration: Number // in hours
  },
  timeline: {
    requestedDate: {
      type: Date,
      required: [true, 'Requested date is required']
    },
    confirmedDate: Date,
    startDate: Date,
    completionDate: Date,
    cancellationDate: Date
  },
  communication: {
    messages: [{
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      message: {
        type: String,
        required: true,
        maxlength: [1000, 'Message cannot exceed 1000 characters']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      isRead: {
        type: Boolean,
        default: false
      }
    }],
    lastMessageAt: Date
  },
  payment: {
    status: {
      type: String,
      enum: ['pending', 'partial', 'completed', 'refunded'],
      default: 'pending'
    },
    method: {
      type: String,
      enum: ['credit_card', 'bank_transfer', 'cash', 'other'],
      default: 'credit_card'
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative']
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative']
    },
    paymentDate: Date,
    invoiceNumber: String,
    receiptUrl: String
  },
  cancellation: {
    reason: String,
    requestedBy: {
      type: String,
      enum: ['producer', 'supplier', 'admin']
    },
    refundAmount: Number,
    cancellationFee: Number
  },
  rating: {
    producerRating: {
      rating: {
        type: Number,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5']
      },
      comment: {
        type: String,
        maxlength: [500, 'Comment cannot exceed 500 characters']
      },
      createdAt: Date
    },
    supplierRating: {
      rating: {
        type: Number,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5']
      },
      comment: {
        type: String,
        maxlength: [500, 'Comment cannot exceed 500 characters']
      },
      createdAt: Date
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
    statusChangedAt: Date,
    lastActivityAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
orderSchema.index({ eventId: 1 });
orderSchema.index({ serviceId: 1 });
orderSchema.index({ supplierId: 1 });
orderSchema.index({ producerId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'timeline.requestedDate': 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ 'metadata.lastActivityAt': -1 });

// Compound indexes for common queries
orderSchema.index({ producerId: 1, status: 1 });
orderSchema.index({ supplierId: 1, status: 1 });
orderSchema.index({ eventId: 1, status: 1 });

// Virtual for order duration
orderSchema.virtual('orderDuration').get(function() {
  if (this.timeline.startDate && this.timeline.completionDate) {
    return Math.ceil((this.timeline.completionDate - this.timeline.startDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Virtual for days until event
orderSchema.virtual('daysUntilEvent').get(function() {
  if (this.eventDetails.eventDate) {
    return Math.ceil((this.eventDetails.eventDate - new Date()) / (1000 * 60 * 60 * 24));
  }
  return null;
});

// Virtual for remaining payment
orderSchema.virtual('remainingPayment').get(function() {
  return this.payment.amount - this.payment.paidAmount;
});

// Pre-save middleware to update metadata
orderSchema.pre('save', function(next) {
  this.metadata.updatedAt = new Date();
  this.metadata.lastActivityAt = new Date();
  
  if (this.isModified('status')) {
    this.metadata.statusChangedAt = new Date();
    
    // Update timeline based on status
    if (this.status === 'confirmed' && !this.timeline.confirmedDate) {
      this.timeline.confirmedDate = new Date();
    } else if (this.status === 'in_progress' && !this.timeline.startDate) {
      this.timeline.startDate = new Date();
    } else if (this.status === 'completed' && !this.timeline.completionDate) {
      this.timeline.completionDate = new Date();
    } else if (this.status === 'cancelled' && !this.timeline.cancellationDate) {
      this.timeline.cancellationDate = new Date();
    }
  }
  
  // Update total price if quantity or unit price changes
  if (this.isModified('orderDetails.quantity') || this.isModified('orderDetails.unitPrice')) {
    this.orderDetails.totalPrice = this.orderDetails.quantity * this.orderDetails.unitPrice;
  }
  
  next();
});

// Static method to find orders by status
orderSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ 'metadata.lastActivityAt': -1 });
};

// Static method to find orders by user
orderSchema.statics.findByUser = function(userId, role) {
  const query = role === 'producer' ? { producerId: userId } : { supplierId: userId };
  return this.find(query).sort({ 'metadata.lastActivityAt': -1 });
};

// Static method to find pending orders
orderSchema.statics.findPendingOrders = function() {
  return this.find({ status: 'pending' }).sort({ 'timeline.requestedDate': 1 });
};

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, reason = '') {
  this.status = newStatus;
  
  if (newStatus === 'cancelled' && reason) {
    this.cancellation.reason = reason;
  }
  
  return this.save();
};

// Method to add message
orderSchema.methods.addMessage = function(senderId, message) {
  this.communication.messages.push({
    senderId,
    message
  });
  
  this.communication.lastMessageAt = new Date();
  this.metadata.lastActivityAt = new Date();
  
  return this.save();
};

// Method to mark messages as read
orderSchema.methods.markMessagesAsRead = function(userId) {
  this.communication.messages.forEach(msg => {
    if (msg.senderId.toString() !== userId.toString()) {
      msg.isRead = true;
    }
  });
  
  return this.save();
};

// Method to add rating
orderSchema.methods.addRating = function(userId, rating, comment, isProducer = true) {
  if (isProducer) {
    this.rating.producerRating = {
      rating,
      comment,
      createdAt: new Date()
    };
  } else {
    this.rating.supplierRating = {
      rating,
      comment,
      createdAt: new Date()
    };
  }
  
  return this.save();
};

module.exports = mongoose.model('Order', orderSchema); 