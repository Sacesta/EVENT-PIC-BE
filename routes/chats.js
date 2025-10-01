const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Event = require('../models/Event');

// @desc    Get all chats for a user
// @route   GET /api/chats
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { eventId, limit = 50, page = 1 } = req.query;
    const userId = req.user._id;

    const options = {
      limit: parseInt(limit),
      eventId: eventId || null
    };

    const chats = await Chat.findUserChats(userId, req.user.role, options);
    
    // Get unread counts for each chat
    const chatsWithUnreadCounts = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = chat.getUnreadCount(userId);
        const chatObj = chat.toObject();
        chatObj.unreadCount = unreadCount;
        return chatObj;
      })
    );

    res.status(200).json({
      success: true,
      data: chatsWithUnreadCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: chatsWithUnreadCounts.length
      }
    });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chats',
      error: error.message
    });
  }
});

// @desc    Get or create a chat between users
// @route   POST /api/chats
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { participants, eventId, title } = req.body;
    const currentUserId = req.user._id;

    // Validate participants
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Participants are required'
      });
    }

    // Add current user to participants if not already included
    const allParticipants = [...participants];
    const currentUserExists = allParticipants.some(p => p.userId === currentUserId.toString());
    if (!currentUserExists) {
      allParticipants.unshift({
        userId: currentUserId.toString(),
        role: req.user.role
      });
    }

    // Validate that all participants exist and are active
    const participantIds = allParticipants.map(p => p.userId);
    const users = await User.find({
      _id: { $in: participantIds },
      isActive: true
    }).select('_id name email role');

    if (users.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more participants not found or inactive'
      });
    }

    // Validate event if provided
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(400).json({
          success: false,
          message: 'Event not found'
        });
      }
    }

    // Find or create chat
    const chat = await Chat.findOrCreateChat(allParticipants, eventId);
    
    if (title && title.trim()) {
      chat.title = title.trim();
      await chat.save();
    }

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Error creating/finding chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create/find chat',
      error: error.message
    });
  }
});

// @desc    Get messages for a specific chat
// @route   GET /api/chats/:chatId/messages
// @access  Private
router.get('/:chatId/messages', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 25, page = 1 } = req.query;
    const userId = req.user._id;

    // Verify user is participant in this chat (or admin)
    const chat = await Chat.findById(chatId).populate('participants.user', '_id name role');
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(p => p.user._id.toString() === userId.toString());
    const isAdmin = req.user.role === 'admin';
    
    if (!isParticipant && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat'
      });
    }

    // Get messages with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messages = await Message.getChatMessages(chatId, {
      limit: parseInt(limit),
      skip
    });

    // Update last read time for current user
    await chat.updateLastRead(userId);

    res.status(200).json({
      success: true,
      data: messages.reverse(), // Return in chronological order
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

// @desc    Get chat details
// @route   GET /api/chats/:chatId
// @access  Private
router.get('/:chatId', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId)
      .populate('participants.user', 'name email role profileImage')
      .populate('event', 'name date location')
      .populate('lastMessage.sender', 'name role profileImage');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify user is participant (or admin)
    const isParticipant = chat.participants.some(p => p.user._id.toString() === userId.toString());
    const isAdmin = req.user.role === 'admin';
    
    if (!isParticipant && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat'
      });
    }

    // Get unread count for current user
    const unreadCount = chat.getUnreadCount(userId);

    const chatData = chat.toObject();
    chatData.unreadCount = unreadCount;

    res.status(200).json({
      success: true,
      data: chatData
    });
  } catch (error) {
    console.error('Error fetching chat details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat details',
      error: error.message
    });
  }
});

// @desc    Update chat settings
// @route   PUT /api/chats/:chatId
// @access  Private
router.put('/:chatId', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title, settings } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify user is participant
    const isParticipant = chat.participants.some(p => p.user.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this chat'
      });
    }

    // Update allowed fields
    if (title !== undefined) {
      chat.title = title.trim();
    }

    if (settings) {
      if (settings.allowFileSharing !== undefined) {
        chat.settings.allowFileSharing = settings.allowFileSharing;
      }
      if (settings.notifications !== undefined) {
        chat.settings.notifications = settings.notifications;
      }
    }

    await chat.save();

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chat',
      error: error.message
    });
  }
});

// @desc    Add participant to chat
// @route   POST /api/chats/:chatId/participants
// @access  Private
router.post('/:chatId/participants', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId: newUserId, role } = req.body;
    const currentUserId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify current user is participant
    const isParticipant = chat.participants.some(p => p.user.toString() === currentUserId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add participants to this chat'
      });
    }

    // Verify new user exists
    const newUser = await User.findById(newUserId);
    if (!newUser || !newUser.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Add participant
    await chat.addParticipant(newUserId, role || newUser.role);

    // Populate and return updated chat
    const updatedChat = await Chat.findById(chatId)
      .populate('participants.user', 'name email role profileImage');

    res.status(200).json({
      success: true,
      data: updatedChat
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add participant',
      error: error.message
    });
  }
});

// @desc    Remove participant from chat
// @route   DELETE /api/chats/:chatId/participants/:userId
// @access  Private
router.delete('/:chatId/participants/:userId', protect, async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const currentUserId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify current user is participant and can remove others (or removing themselves)
    const isParticipant = chat.participants.some(p => p.user.toString() === currentUserId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove participants from this chat'
      });
    }

    // Users can only remove themselves unless they're the chat creator
    if (userId !== currentUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only remove yourself from the chat'
      });
    }

    // Remove participant
    await chat.removeParticipant(userId);

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully'
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove participant',
      error: error.message
    });
  }
});

// @desc    Mark messages as read
// @route   PUT /api/chats/:chatId/read
// @access  Private
router.put('/:chatId/read', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify user is participant
    const isParticipant = chat.participants.some(p => p.user.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to mark messages as read in this chat'
      });
    }

    // Update last read time
    await chat.updateLastRead(userId);

    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
});

// @desc    Archive chat
// @route   PUT /api/chats/:chatId/archive
// @access  Private
router.put('/:chatId/archive', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Verify user is participant
    const isParticipant = chat.participants.some(p => p.user.toString() === userId.toString());
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to archive this chat'
      });
    }

    chat.status = 'archived';
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Chat archived successfully'
    });
  } catch (error) {
    console.error('Error archiving chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive chat',
      error: error.message
    });
  }
});

// @desc    Get all chats for admin monitoring
// @route   GET /api/chats/admin/all
// @access  Private (Admin only)
router.get('/admin/all', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { limit = 100, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chats = await Chat.find({ status: 'active' })
      .populate('participants.user', 'name email role profileImage')
      .populate('event', 'name date location')
      .populate('lastMessage.sender', 'name role profileImage')
      .sort({ 'lastMessage.timestamp': -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalChats = await Chat.countDocuments({ status: 'active' });

    res.status(200).json({
      success: true,
      data: chats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalChats,
        pages: Math.ceil(totalChats / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching all chats for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chats',
      error: error.message
    });
  }
});

module.exports = router;
