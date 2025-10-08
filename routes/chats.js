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
  console.log('\n=== CREATE CHAT REQUEST START ===');
  console.log('1. Request received at:', new Date().toISOString());
  console.log('2. Request method:', req.method);
  console.log('3. Content-Type header:', req.headers['content-type']);
  console.log('4. req.body exists:', !!req.body);
  console.log('5. req.body type:', typeof req.body);
  console.log('6. req.body content:', JSON.stringify(req.body, null, 2));
  
  try {
    console.log("Creating or finding chat with body:", req.body);
    const { participants, eventId, title } = req.body;

    const currentUserId = req.user._id;

    console.log("7. Extracted values:");
    console.log("   - Current user ID:", currentUserId);
    console.log("   - Participants:", JSON.stringify(participants, null, 2));
    console.log("   - Event ID:", eventId);
    console.log("   - Title:", title);

    // Validate participants
    console.log("8. Validating participants...");
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      console.log("   ❌ Validation failed - participants invalid");
      return res.status(400).json({
        success: false,
        message: 'Participants are required'
      });
    }
    console.log("   ✓ Participants valid, count:", participants.length);

    // Add current user to participants if not already included
    console.log("9. Checking if current user in participants...");
    const allParticipants = [...participants];
    const currentUserExists = allParticipants.some(p => p.userId === currentUserId.toString());
    console.log("   Current user exists:", currentUserExists);
    
    if (!currentUserExists) {
      console.log("   Adding current user to participants");
      allParticipants.unshift({
        userId: currentUserId.toString(),
        role: req.user.role
      });
    }
    console.log("   Total participants:", allParticipants.length);

    // Validate that all participants exist and are active
    console.log("10. Validating users in database...");
    const participantIds = allParticipants.map(p => p.userId);
    console.log("    Participant IDs:", participantIds);
    
    const users = await User.find({
      _id: { $in: participantIds },
      isActive: true
    }).select('_id name email role');
    
    console.log("    Found users:", users.length, "/ Expected:", participantIds.length);

    if (users.length !== participantIds.length) {
      console.log("    ❌ User validation failed");
      return res.status(400).json({
        success: false,
        message: 'One or more participants not found or inactive'
      });
    }
    console.log("    ✓ All users validated");

    // Validate event if provided
    if (eventId) {
      console.log("11. Validating event:", eventId);
      const event = await Event.findById(eventId);
      if (!event) {
        console.log("    ❌ Event not found");
        return res.status(400).json({
          success: false,
          message: 'Event not found'
        });
      }
      console.log("    ✓ Event validated:", event.name);
    } else {
      console.log("11. No eventId provided, skipping event validation");
    }

    // Find or create chat
    console.log("12. Calling Chat.findOrCreateChat...");
    console.log("    Params:", { 
      participantCount: allParticipants.length, 
      eventId: eventId || 'none' 
    });
    
    const chat = await Chat.findOrCreateChat(allParticipants, eventId);
    
    console.log("13. Chat result:");
    console.log("    Chat ID:", chat._id);
    console.log("    Participants:", chat.participants.length);
    console.log("    Status:", chat.status);
    
    if (title && title.trim()) {
      console.log("14. Updating chat title to:", title.trim());
      chat.title = title.trim();
      await chat.save();
    }

    console.log("15. ✓ Success! Sending response...");
    console.log('=== CREATE CHAT REQUEST END ===\n');
    
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

// @desc    Send a message to a chat
// @route   POST /api/chats/:chatId/messages
// @access  Private
router.post('/:chatId/messages', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = 'text', replyTo, attachments } = req.body;
    const userId = req.user._id;



    console.log("content:", content);    console.log("type:", type);
    console.log("replyTo:", replyTo);
    console.log("attachments:", attachments);   

    // Validate content
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Verify user is participant in this chat (or admin)
    const chat = await Chat.findById(chatId).populate('participants.user', '_id name role');
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(p => p.user._id.toString() === userId.toString());
    
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages to this chat'
      });
    }

    // Validate message type
    const validTypes = ['text', 'image', 'file', 'system'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid message type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate replyTo if provided
    if (replyTo) {
      const replyToMessage = await Message.findById(replyTo);
      if (!replyToMessage || replyToMessage.chat.toString() !== chatId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reply message reference'
        });
      }
    }

    // Create new message
    const messageData = {
      chat: chatId,
      sender: userId,
      content: content.trim(),
      type
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      messageData.attachments = attachments;
    }

    const message = new Message(messageData);
    await message.save();

    // Populate message details
    await message.populate('sender', 'name email role profileImage');
    if (replyTo) {
      await message.populate('replyTo', 'content sender');
      await message.populate('replyTo.sender', 'name role');
    }

    // Update chat's last message (this is also done in Message pre-save hook, but we do it here for immediate response)
    chat.lastMessage = {
      content: message.content,
      sender: userId,
      timestamp: message.createdAt
    };
    await chat.save();

    // Increment unread counts for other participants
    await chat.incrementUnreadCount(userId);

    // Emit WebSocket event for real-time updates (if socket service is available)
    try {
      const socketService = require('../services/socketService');
      if (socketService && socketService.io) {
        // Emit to chat room
        socketService.io.to(`chat_${chatId}`).emit('new_message', {
          message: {
            _id: message._id,
            content: message.content,
            type: message.type,
            sender: message.sender,
            replyTo: message.replyTo,
            attachments: message.attachments,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
          },
          chatId
        });

        // Emit unread count updates to participants
        for (const participant of chat.participants) {
          if (participant.user._id.toString() !== userId.toString()) {
            const unreadCount = chat.getUnreadCount(participant.user._id);
            socketService.io.to(`user_${participant.user._id}`).emit('unread_count_update', {
              chatId,
              unreadCount
            });
          }
        }
      }
    } catch (socketError) {
      console.error('WebSocket notification error:', socketError);
      // Don't fail the request if WebSocket fails
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

// @desc    Update/Edit a message
// @route   PUT /api/chats/:chatId/messages/:messageId
// @access  Private
router.put('/:chatId/messages/:messageId', protect, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    // Validate content
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Find the message
    const message = await Message.findById(messageId).populate('sender', 'name email role profileImage');
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify message belongs to the specified chat
    if (message.chat.toString() !== chatId) {
      return res.status(400).json({
        success: false,
        message: 'Message does not belong to this chat'
      });
    }

    // Verify message is not deleted
    if (message.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a deleted message'
      });
    }

    // Verify user is the sender
    if (message.sender._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the sender can edit the message'
      });
    }

    // System messages cannot be edited
    if (message.type === 'system') {
      return res.status(400).json({
        success: false,
        message: 'System messages cannot be edited'
      });
    }

    // Edit the message using the model method
    await message.editMessage(content.trim(), userId);

    // Populate message details
    await message.populate('replyTo', 'content sender');
    if (message.replyTo) {
      await message.populate('replyTo.sender', 'name role');
    }

    // Update chat's last message if this was the last message
    const chat = await Chat.findById(chatId);
    if (chat && chat.lastMessage && chat.lastMessage.sender.toString() === userId.toString()) {
      const lastMessage = await Message.findOne({ chat: chatId, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .limit(1);
      
      if (lastMessage && lastMessage._id.toString() === messageId) {
        chat.lastMessage = {
          content: message.content,
          sender: userId,
          timestamp: message.createdAt
        };
        await chat.save();
      }
    }

    // Emit WebSocket event for real-time updates
    try {
      const socketService = require('../services/socketService');
      if (socketService && socketService.io) {
        socketService.io.to(`chat_${chatId}`).emit('message_updated', {
          message: {
            _id: message._id,
            content: message.content,
            editedAt: message.editedAt,
            originalContent: message.originalContent,
            sender: message.sender,
            replyTo: message.replyTo,
            attachments: message.attachments,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
          },
          chatId
        });
      }
    } catch (socketError) {
      console.error('WebSocket notification error:', socketError);
      // Don't fail the request if WebSocket fails
    }

    res.status(200).json({
      success: true,
      message: 'Message updated successfully',
      data: message
    });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update message',
      error: error.message
    });
  }
});

// @desc    Delete a message
// @route   DELETE /api/chats/:chatId/messages/:messageId
// @access  Private
router.delete('/:chatId/messages/:messageId', protect, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user._id;

    // Find the message
    const message = await Message.findById(messageId).populate('sender', 'name email role profileImage');
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify message belongs to the specified chat
    if (message.chat.toString() !== chatId) {
      return res.status(400).json({
        success: false,
        message: 'Message does not belong to this chat'
      });
    }

    // Verify message is not already deleted
    if (message.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Message is already deleted'
      });
    }

    // Verify user is the sender or admin
    const isSender = message.sender._id.toString() === userId.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isSender && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the sender or admin can delete the message'
      });
    }

    // Delete the message using the model method
    await message.deleteMessage(userId);

    // Update chat's last message if this was the last message
    const chat = await Chat.findById(chatId);
    if (chat && chat.lastMessage) {
      const lastMessage = await Message.findOne({ chat: chatId, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .limit(1)
        .populate('sender', 'name role');
      
      if (lastMessage) {
        chat.lastMessage = {
          content: lastMessage.content,
          sender: lastMessage.sender._id,
          timestamp: lastMessage.createdAt
        };
      } else {
        // No messages left, clear last message
        chat.lastMessage = {
          content: '',
          sender: null,
          timestamp: new Date()
        };
      }
      await chat.save();
    }

    // Emit WebSocket event for real-time updates
    try {
      const socketService = require('../services/socketService');
      if (socketService && socketService.io) {
        socketService.io.to(`chat_${chatId}`).emit('message_deleted', {
          messageId: message._id,
          chatId,
          deletedBy: userId
        });
      }
    } catch (socketError) {
      console.error('WebSocket notification error:', socketError);
      // Don't fail the request if WebSocket fails
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
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
    // const isAdmin = req.user.role === 'admin'; && !isAdmin
    
    if (!isParticipant ) {
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

// @desc    Get all chats for a specific event
// @route   GET /api/chats/event/:eventId
// @access  Private
// router.get('/event/:eventId', protect, async (req, res) => {
//   try {
//     const { eventId } = req.params;
//     const { limit = 50, page = 1 } = req.query;
//     const userId = req.user._id;

//     // Verify event exists
//     const event = await Event.findById(eventId);
//     if (!event) {
//       return res.status(404).json({
//         success: false,
//         message: 'Event not found'
//       });
//     }

//     // Get chats for this event
//     const options = {
//       limit: parseInt(limit),
//       eventId: eventId
//     };

//     const chats = await Chat.findUserChats(userId, req.user.role, options);
    
//     // Get unread counts for each chat
//     const chatsWithUnreadCounts = await Promise.all(
//       chats.map(async (chat) => {
//         const unreadCount = chat.getUnreadCount(userId);
//         const chatObj = chat.toObject();
//         chatObj.unreadCount = unreadCount;
//         return chatObj;
//       })
//     );

//     res.status(200).json({
//       success: true,
//       data: chatsWithUnreadCounts,
//       event: {
//         _id: event._id,
//         name: event.name,
//         date: event.date,
//         location: event.location
//       },
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total: chatsWithUnreadCounts.length
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching chats for event:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch chats for event',
//       error: error.message
//     });
//   }
// });

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
