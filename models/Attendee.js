const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'Event ID is required'],
    index: true
  },
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: false, // Optional - can be null for embedded tickets
    index: true
  },
  // Attendee Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [1, 'Age must be at least 1'],
    max: [150, 'Age cannot exceed 150']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['male', 'female', 'other', 'prefer-not-to-say']
  },
  // Booking Information
  ticketType: {
    type: String,
    required: true
  },
  ticketTitle: {
    type: String,
    required: false
  },
  ticketQuantity: {
    type: Number,
    required: true,
    min: [1, 'Ticket quantity must be at least 1'],
    default: 1
  },
  ticketPrice: {
    type: Number,
    required: true,
    min: [0, 'Ticket price cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative']
  },
  // Booking Status
  bookingStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'refunded'],
    default: 'confirmed'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed'
  },
  // Booking Reference
  bookingReference: {
    type: String,
    unique: true,
    required: true
  },
  // QR Code for ticket verification
  qrCode: {
    type: String
  },
  // Check-in Information
  checkedIn: {
    type: Boolean,
    default: false
  },
  checkedInAt: {
    type: Date
  },
  checkedInBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Additional Information
  specialRequirements: {
    type: String,
    maxlength: [500, 'Special requirements cannot exceed 500 characters']
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  // Metadata
  registeredAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  cancelledAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
attendeeSchema.index({ eventId: 1, bookingStatus: 1 });
attendeeSchema.index({ email: 1, eventId: 1 });
attendeeSchema.index({ bookingReference: 1 });
attendeeSchema.index({ registeredAt: -1 });

// Virtual for event details
attendeeSchema.virtual('event', {
  ref: 'Event',
  localField: 'eventId',
  foreignField: '_id',
  justOne: true
});

// Virtual for ticket details
attendeeSchema.virtual('ticket', {
  ref: 'Ticket',
  localField: 'ticketId',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to update timestamps
attendeeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  if (this.isModified('bookingStatus')) {
    if (this.bookingStatus === 'cancelled' && !this.cancelledAt) {
      this.cancelledAt = new Date();
    } else if (this.bookingStatus === 'refunded' && !this.refundedAt) {
      this.refundedAt = new Date();
    }
  }
  
  next();
});

// Static method to generate unique booking reference
attendeeSchema.statics.generateBookingReference = async function() {
  const prefix = 'BK';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Static method to find attendees by event
attendeeSchema.statics.findByEvent = function(eventId, status = null) {
  const query = { eventId };
  if (status) {
    query.bookingStatus = status;
  }
  return this.find(query)
    .populate('ticketId', 'title type price')
    .sort({ registeredAt: -1 });
};

// Static method to get event statistics
attendeeSchema.statics.getEventStatistics = async function(eventId) {
  const stats = await this.aggregate([
    { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
    {
      $group: {
        _id: '$bookingStatus',
        count: { $sum: 1 },
        totalTickets: { $sum: '$ticketQuantity' },
        totalRevenue: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  const result = {
    totalAttendees: 0,
    confirmedAttendees: 0,
    cancelledAttendees: 0,
    totalTicketsSold: 0,
    totalRevenue: 0,
    checkedInCount: 0
  };
  
  stats.forEach(stat => {
    result.totalAttendees += stat.count;
    result.totalTicketsSold += stat.totalTickets;
    
    if (stat._id === 'confirmed') {
      result.confirmedAttendees = stat.count;
      result.totalRevenue = stat.totalRevenue;
    } else if (stat._id === 'cancelled') {
      result.cancelledAttendees = stat.count;
    }
  });
  
  // Get checked-in count
  const checkedIn = await this.countDocuments({ eventId, checkedIn: true });
  result.checkedInCount = checkedIn;
  
  return result;
};

// Method to check in attendee
attendeeSchema.methods.checkIn = function(userId) {
  if (this.checkedIn) {
    throw new Error('Attendee already checked in');
  }
  
  if (this.bookingStatus !== 'confirmed') {
    throw new Error('Only confirmed bookings can be checked in');
  }
  
  this.checkedIn = true;
  this.checkedInAt = new Date();
  this.checkedInBy = userId;
  
  return this.save();
};

// Method to cancel booking
attendeeSchema.methods.cancelBooking = function() {
  if (this.bookingStatus === 'cancelled') {
    throw new Error('Booking is already cancelled');
  }
  
  this.bookingStatus = 'cancelled';
  this.cancelledAt = new Date();
  
  return this.save();
};

module.exports = mongoose.model('Attendee', attendeeSchema);
