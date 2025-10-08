const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  // Participants in the chat
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['producer', 'supplier', 'admin'],
      required: true
    },
    lastReadAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Event this chat is related to (optional)
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: false
  },
  
  // Chat metadata
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Chat title cannot be more than 100 characters']
  },
  
  // Chat status
  status: {
    type: String,
    enum: ['active', 'archived', 'blocked'],
    default: 'active'
  },
  
  // Last message info for quick access
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  
  // Unread count per participant
  unreadCounts: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  }],
  
  // Chat settings
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ event: 1 });
chatSchema.index({ status: 1 });
chatSchema.index({ 'lastMessage.timestamp': -1 });
chatSchema.index({ 'participants.user': 1, 'participants.role': 1 });

// Compound index for finding chats between specific users
chatSchema.index({ 
  'participants.user': 1, 
  event: 1 
});

// Virtual to get participant count
chatSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Method to add a participant
chatSchema.methods.addParticipant = function(userId, role) {
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (!existingParticipant) {
    this.participants.push({
      user: userId,
      role: role,
      lastReadAt: new Date(),
      isActive: true
    });
    
    // Initialize unread count for new participant
    this.unreadCounts.push({
      user: userId,
      count: 0
    });
  }
  
  return this.save();
};

// Method to remove a participant
chatSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.user.toString() !== userId.toString());
  this.unreadCounts = this.unreadCounts.filter(u => u.user.toString() !== userId.toString());
  
  return this.save();
};

// Method to update last read time for a participant
chatSchema.methods.updateLastRead = function(userId) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  if (participant) {
    participant.lastReadAt = new Date();
  }
  
  // Reset unread count
  const unreadCount = this.unreadCounts.find(u => u.user.toString() === userId.toString());
  if (unreadCount) {
    unreadCount.count = 0;
  }
  
  return this.save();
};

// Method to increment unread count for all participants except sender
chatSchema.methods.incrementUnreadCount = function(senderId) {
  this.unreadCounts.forEach(unreadCount => {
    if (unreadCount.user.toString() !== senderId.toString()) {
      unreadCount.count += 1;
    }
  });
  
  return this.save();
};

// Method to get unread count for a specific user
chatSchema.methods.getUnreadCount = function(userId) {
  const unreadCount = this.unreadCounts.find(u => u.user.toString() === userId.toString());
  return unreadCount ? unreadCount.count : 0;
};

// Method to update last message
chatSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    content: message.content,
    sender: message.sender._id || message.sender,
    timestamp: message.createdAt || new Date()
  };
  return this.save();
};

// Static method to find or create chat between users
chatSchema.statics.findOrCreateChat = async function(participants, eventId = null) {
  // Create a sorted array of participant IDs for consistent lookup
  const participantIds = participants.map(p => p.userId).sort();
  
  console.log('Finding or creating chat with participants:', participantIds);
  
  // Try to find existing chat with exact same participants
  // Use $all to ensure all participants are present, and $size to ensure no extra participants
  let chat = await this.findOne({
    'participants.user': { $all: participantIds },
    $expr: { $eq: [{ $size: '$participants' }, participantIds.length] },
   
    status: 'active'
  }).populate('participants.user', 'name email role profileImage');
  
  console.log('Existing chat found:', chat ? chat._id : 'No');
  
  if (!chat) {
    console.log('Creating new chat...');
    // Create new chat
    chat = new this({
      participants: participants.map(p => ({
        user: p.userId,
        role: p.role,
        lastReadAt: new Date(),
        isActive: true
      })),
      unreadCounts: participants.map(p => ({
        user: p.userId,
        count: 0
      }))
    });
    
    await chat.save();
    console.log('New chat created:', chat._id);
    
    // Populate the created chat
    chat = await this.findById(chat._id).populate('participants.user', 'name email role profileImage');
  }
  
  return chat;
};

// Static method to find chats for a user
chatSchema.statics.findUserChats = function(userId, userRole, options = {}) {
  let query = {
    status: 'active'
  };
  
  // If user is NOT admin, they can only see chats they're part of
  if (userRole !== 'admin') {
    query['participants.user'] = userId;
  }
  
  if (options.eventId) {
    query.event = options.eventId;
  }
  
  return this.find(query)
    .populate('participants.user', 'name email role profileImage')
    .populate('event', 'name date location')
    .populate('lastMessage.sender', 'name role')
    .sort({ 'lastMessage.timestamp': -1 })
    .limit(options.limit || 50);
};

module.exports = mongoose.model('Chat', chatSchema);
