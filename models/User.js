const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [30, 'Name cannot be more than 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please enter a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  profileImage: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['producer', 'supplier', 'admin'],
    required: [true, 'Role is required'],
    default: 'producer'
  },
  language: {
    type: String,
    enum: ['he', 'en', 'ar'],
    default: 'he'
  },
  phone: {
    type: String,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationDocuments: [{
    type: {
      type: String,
      enum: ['id_card', 'business_license', 'tax_certificate', 'other']
    },
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    darkMode: {
      type: Boolean,
      default: false
    },
    emailNotifications: {
      type: Boolean,
      default: true
    }
  },
  // Producer specific fields
  producerDetails: {
    description:String,
    companyName: String,
    businessLicense: String,
    experience: {
      type: String,
      enum: ['beginner', 'intermediate', 'expert']
    },
    specializations: [String]
  },
  // Supplier specific fields
  supplierDetails: {
    companyName: String,
    description: String,
    businessLicense: String,
    categories: [String],
    experience: {
      type: String,
      enum: ['beginner', 'intermediate', 'expert']
    },
    location: {
      city: String,
      country: String
    },
    website: String,
    portfolio: [String],
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },
  // References to other collections
  events: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  services: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance (email index is automatically created by unique: true)
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ verificationStatus: 1 });
userSchema.index({ 'supplierDetails.categories': 1 });
userSchema.index({ 'supplierDetails.rating.average': -1 });

// Virtual for full profile URL
userSchema.virtual('profileImageUrl').get(function() {
  if (this.profileImage) {
    return this.profileImage.startsWith('http') 
      ? this.profileImage 
      : `${process.env.BASE_URL}/uploads/${this.profileImage}`;
  }
  return null;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Always hash password for new users or when password is modified
  if (this.isNew || this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  next();
});

// Method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return token;
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  
  return token;
};

// Method to verify email verification token
userSchema.methods.verifyEmailToken = function(token) {
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.emailVerificationToken === hashedToken && 
         this.emailVerificationExpires > Date.now();
};

// Method to verify password reset token
userSchema.methods.verifyPasswordResetToken = function(token) {
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.passwordResetToken === hashedToken && 
         this.passwordResetExpires > Date.now();
};

// Method to get public profile (without sensitive data)
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  
  delete userObject.password;
  delete userObject.verificationDocuments;
  delete userObject.settings;
  
  return userObject;
};

// Static method to find users by role
userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

// Static method to find verified suppliers
userSchema.statics.findVerifiedSuppliers = function() {
  return this.find({ 
    role: 'supplier', 
    isVerified: true, 
    isActive: true 
  });
};

module.exports = mongoose.model('User', userSchema); 