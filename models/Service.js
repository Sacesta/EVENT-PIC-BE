const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Supplier ID is required']
  },
  title: {
    type: String,
    required: [true, 'Service title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  image: {
    type: String,
    default: null
  },
  price: {
    amount: {
      type: Number,
      required: false, // Made optional - pricing handled in packages
      min: [0, 'Price cannot be negative'],
      default: 0
    },
    currency: {
      type: String,
      enum: ['ILS', 'USD', 'EUR'],
      default: 'ILS'
    },
    pricingType: {
      type: String,
      enum: ['fixed', 'per_hour', 'per_person', 'per_day', 'per_project', 'negotiable'],
      default: 'negotiable'
    },
    minPrice: {
      type: Number,
      min: [0, 'Minimum price cannot be negative']
    },
    maxPrice: {
      type: Number,
      min: [0, 'Maximum price cannot be negative']
    }
  },
category: {
  type: String,
  required: [true, 'Service category is required'],
  enum: [
    'photography',          // צלמים
    'videography',          // וידאו
    'catering',             // קייטרינג
    'bar',                  // בר
    'music',                // מוזיקה
    'musicians',            // אומנים
    'decoration',           // תפאורה
    'scenery',              // scenery / תפאורה
    'lighting',             // תאורה
    'sound',                // הגברה
    'sounds_lights',        // הגברה ותאורה
    'transportation',       // שירותי הסעות
    'security',             // אבטחה
    'first_aid',            // עזרה ראשונה
    'insurance',            // ביטוח
    'furniture',            // ריהוט
    'tents',                // אוהלים
    'location',             // מקומות להשכרה
    'dj',                   // DJ
    'other'                 // אחר
  ]
}
,
  subcategories: [{
    type: String,
    trim: true
  }],
  tags: [String],
  available: {
    type: Boolean,
    default: true
  },
  availability: {
    startDate: Date,
    endDate: Date,
    workingHours: {
      monday: { start: String, end: String, available: { type: Boolean, default: true } },
      tuesday: { start: String, end: String, available: { type: Boolean, default: true } },
      wednesday: { start: String, end: String, available: { type: Boolean, default: true } },
      thursday: { start: String, end: String, available: { type: Boolean, default: true } },
      friday: { start: String, end: String, available: { type: Boolean, default: true } },
      saturday: { start: String, end: String, available: { type: Boolean, default: true } },
      sunday: { start: String, end: String, available: { type: Boolean, default: true } }
    },
    leadTime: {
      type: Number, // in days
      default: 1,
      min: [0, 'Lead time cannot be negative']
    }
  },
  location: {
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
    },
    serviceRadius: {
      type: Number, // in kilometers
      default: 50,
      min: [0, 'Service radius cannot be negative']
    }
  },
  experience: {
    type: String,
    enum: ['beginner', 'intermediate', 'expert'],
    default: 'intermediate'
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5']
    },
    count: {
      type: Number,
      default: 0,
      min: [0, 'Rating count cannot be negative']
    },
    reviews: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },
      comment: {
        type: String,
        maxlength: [500, 'Review comment cannot exceed 500 characters']
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  portfolio: [{
    title: String,
    description: String,
    image: String,
    eventType: String,
    date: Date
  }],
  packages: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    price: {
      type: Number,
      required: true,
      min: [0, 'Package price cannot be negative']
    },
    features: [String],
    duration: Number, // in hours
    isPopular: {
      type: Boolean,
      default: false
    }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending_approval', 'suspended'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  inquiries: {
    type: Number,
    default: 0
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
    approvedAt: Date,
    lastInquiryAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
serviceSchema.index({ supplierId: 1 });
serviceSchema.index({ category: 1 });
serviceSchema.index({ status: 1 });
serviceSchema.index({ available: 1 });
serviceSchema.index({ 'location.city': 1 });
serviceSchema.index({ 'location.coordinates': '2dsphere' });
serviceSchema.index({ 'price.amount': 1 });
serviceSchema.index({ 'rating.average': -1 });
serviceSchema.index({ featured: 1, status: 1 });
serviceSchema.index({ tags: 1 });

// Virtual for full image URL
serviceSchema.virtual('imageUrl').get(function() {
  if (this.image) {
    return this.image.startsWith('http') 
      ? this.image 
      : `${process.env.BASE_URL}/uploads/${this.image}`;
  }
  return null;
});

// Virtual for portfolio image URLs
// serviceSchema.virtual('portfolioUrls').get(function() {
//   return this.portfolio.map(item => ({
//     ...item.toObject(),
//     imageUrl: item.image.startsWith('http') 
//       ? item.image 
//       : `${process.env.BASE_URL}/uploads/${item.image}`
//   }));
// });

// Virtual for average rating
// serviceSchema.virtual('averageRating').get(function() {
//   if (this.rating.reviews.length === 0) return 0;
  
//   const totalRating = this.rating.reviews.reduce((sum, review) => sum + review.rating, 0);
//   return Math.round((totalRating / this.rating.reviews.length) * 10) / 10;
// });

// Pre-save middleware to update metadata
serviceSchema.pre('save', function(next) {
  this.metadata.updatedAt = new Date();
  
  if (this.isModified('status') && this.status === 'active' && !this.metadata.approvedAt) {
    this.metadata.approvedAt = new Date();
  }
  
  // Update rating average and count
  if (this.rating.reviews.length > 0) {
    const totalRating = this.rating.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating.average = Math.round((totalRating / this.rating.reviews.length) * 10) / 10;
    this.rating.count = this.rating.reviews.length;
  }
  
  next();
});

// Static method to find services by category
serviceSchema.statics.findByCategory = function(category) {
  return this.find({
    category,
    status: 'active',
    available: true
  }).sort({ 'rating.average': -1, views: -1 });
};

// Static method to find services by location
serviceSchema.statics.findByLocation = function(city, maxDistance = 50) {
  return this.find({
    'location.city': new RegExp(city, 'i'),
    status: 'active',
    available: true
  }).sort({ 'rating.average': -1, views: -1 });
};

// Static method to find featured services
serviceSchema.statics.findFeatured = function() {
  return this.find({
    featured: true,
    status: 'active',
    available: true
  }).sort({ 'rating.average': -1, views: -1 });
};

// Method to add review
serviceSchema.methods.addReview = function(userId, rating, comment) {
  // Check if user already reviewed
  const existingReview = this.rating.reviews.find(
    review => review.userId.toString() === userId.toString()
  );
  
  if (existingReview) {
    throw new Error('User has already reviewed this service');
  }
  
  this.rating.reviews.push({
    userId,
    rating,
    comment
  });
  
  return this.save();
};

// Method to update availability
serviceSchema.methods.updateAvailability = function(available, startDate, endDate) {
  this.available = available;
  if (startDate) this.availability.startDate = startDate;
  if (endDate) this.availability.endDate = endDate;
  
  return this.save();
};

module.exports = mongoose.model('Service', serviceSchema); 