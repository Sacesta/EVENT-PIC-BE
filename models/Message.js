const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Chat this message belongs to
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  
  // Message sender
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Message content
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot be more than 2000 characters']
  },
  
  // Message type
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  
  // File attachments (for image/file messages)
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    thumbnailUrl: String // For images
  }],
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  
  // Reply to another message (for threaded conversations)
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Message metadata
  metadata: {
    // For system messages
    systemType: {
      type: String,
      enum: ['user_joined', 'user_left', 'chat_created', 'event_updated']
    },
    // Additional data for system messages
    data: mongoose.Schema.Types.Mixed
  },
  
  // Message reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message editing history
  editedAt: {
    type: Date
  },
  originalContent: {
    type: String
  },
  
  // Soft delete
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ type: 1 });
messageSchema.index({ 'reactions.user': 1 });

// Virtual to check if message is edited
messageSchema.virtual('isEdited').get(function() {
  return !!this.editedAt;
});

// Virtual to check if message is deleted
messageSchema.virtual('isDeleted').get(function() {
  return !!this.deletedAt;
});

// Method to add a reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji,
    createdAt: new Date()
  });
  
  return this.save();
};

// Method to remove a reaction
messageSchema.methods.removeReaction = function(userId, emoji) {
  this.reactions = this.reactions.filter(r => 
    !(r.user.toString() === userId.toString() && r.emoji === emoji)
  );
  
  return this.save();
};

// Method to edit message
messageSchema.methods.editMessage = function(newContent, userId) {
  if (this.sender.toString() !== userId.toString()) {
    throw new Error('Only the sender can edit the message');
  }
  
  this.originalContent = this.content;
  this.content = newContent;
  this.editedAt = new Date();
  
  return this.save();
};

// Method to soft delete message
messageSchema.methods.deleteMessage = function(userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.content = 'This message was deleted';
  
  return this.save();
};

// Method to mark as read
messageSchema.methods.markAsRead = function() {
  this.status = 'read';
  return this.save();
};

// Static method to get messages for a chat with pagination
messageSchema.statics.getChatMessages = function(chatId, options = {}) {
  const query = {
    chat: chatId,
    deletedAt: { $exists: false }
  };
  
  const sortOptions = { createdAt: -1 };
  const limit = options.limit || 25;
  const skip = options.skip || 0;
  
  return this.find(query)
    .populate('sender', 'name email role profileImage')
    .populate('replyTo', 'content sender')
    .populate('replyTo.sender', 'name role')
    .sort(sortOptions)
    .limit(limit)
    .skip(skip);
};

// Static method to get unread messages count for a user in a chat
messageSchema.statics.getUnreadCount = function(chatId, userId, lastReadAt) {
  return this.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    createdAt: { $gt: lastReadAt },
    deletedAt: { $exists: false }
  });
};

// Static method to mark messages as read
messageSchema.statics.markMessagesAsRead = function(chatId, userId, lastReadAt) {
  return this.updateMany(
    {
      chat: chatId,
      sender: { $ne: userId },
      createdAt: { $lte: lastReadAt },
      status: { $ne: 'read' }
    },
    { status: 'read' }
  );
};

// Pre-save middleware to update chat's last message
messageSchema.pre('save', async function(next) {
  if (this.isNew && this.type !== 'system') {
    try {
      const Chat = mongoose.model('Chat');
      await Chat.findByIdAndUpdate(this.chat, {
        'lastMessage.content': this.content,
        'lastMessage.sender': this.sender,
        'lastMessage.timestamp': this.createdAt || new Date()
      });
    } catch (error) {
      console.error('Error updating chat last message:', error);
    }
  }
  next();
});

// Post-save middleware to increment unread counts
messageSchema.post('save', async function(doc) {
  if (doc.isNew && doc.type !== 'system') {
    try {
      const Chat = mongoose.model('Chat');
      await Chat.findByIdAndUpdate(doc.chat, {
        $inc: {
          'unreadCounts.$[elem].count': 1
        }
      }, {
        arrayFilters: [{ 'elem.user': { $ne: doc.sender } }]
      });
    } catch (error) {
      console.error('Error incrementing unread counts:', error);
    }
  }
});

module.exports = mongoose.model('Message', messageSchema);
