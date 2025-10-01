const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
  }

  initialize(server) {
    const { Server } = require('socket.io');
    
    this.io = new Server(server, {
      cors: {
        origin: [
          'https://pic-fe.vercel.app', 
          'http://localhost:3000', 
          'http://localhost:5173'
        ],
        methods: ['GET', 'POST'],
        credentials: false
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    console.log('🔌 WebSocket server initialized');
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('_id name email role isActive');
        
        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }

        socket.userId = user._id.toString();
        socket.user = user;
        next();
      } catch (error) {
        console.error('Socket authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`👤 User ${socket.user.name} (${socket.userId}) connected`);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, socket.id);
      this.userSockets.set(socket.id, socket.userId);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
      
      // If user is admin, join admin monitoring room
      if (socket.user.role === 'admin') {
        socket.join('admin_monitoring');
        console.log(`👑 Admin ${socket.user.name} joined monitoring room`);
      }

      // Handle joining chat rooms
      socket.on('join_chat', async (data) => {
        try {
          const { chatId } = data;
          
          // Verify user is participant in this chat (or admin)
          const chat = await Chat.findById(chatId).populate('participants.user', '_id name role');
          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          const isParticipant = chat.participants.some(p => p.user._id.toString() === socket.userId);
          const isAdmin = socket.user.role === 'admin';
          
          if (!isParticipant && !isAdmin) {
            socket.emit('error', { message: 'Not authorized to join this chat' });
            return;
          }

          socket.join(`chat_${chatId}`);
          socket.currentChatId = chatId;
          
          // Update last read time
          await chat.updateLastRead(socket.userId);
          
          // Emit chat joined event
          socket.emit('chat_joined', { chatId });
          
          console.log(`👤 User ${socket.user.name} joined chat ${chatId}`);
        } catch (error) {
          console.error('Error joining chat:', error);
          socket.emit('error', { message: 'Failed to join chat' });
        }
      });

      // Handle leaving chat rooms
      socket.on('leave_chat', (data) => {
        const { chatId } = data;
        socket.leave(`chat_${chatId}`);
        if (socket.currentChatId === chatId) {
          socket.currentChatId = null;
        }
        socket.emit('chat_left', { chatId });
        console.log(`👤 User ${socket.user.name} left chat ${chatId}`);
      });

      // Handle sending messages
      socket.on('send_message', async (data) => {
        try {
          const { chatId, content, type = 'text', replyTo } = data;
          
          if (!content || !content.trim()) {
            socket.emit('error', { message: 'Message content is required' });
            return;
          }

          // Verify user is participant in this chat (or admin)
          const chat = await Chat.findById(chatId).populate('participants.user', '_id name role');
          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          const isParticipant = chat.participants.some(p => p.user._id.toString() === socket.userId);
          const isAdmin = socket.user.role === 'admin';
          
          if (!isParticipant && !isAdmin) {
            socket.emit('error', { message: 'Not authorized to send messages to this chat' });
            return;
          }

          // Create new message
          const message = new Message({
            chat: chatId,
            sender: socket.userId,
            content: content.trim(),
            type,
            replyTo
          });

          await message.save();
          await message.populate('sender', 'name email role profileImage');
          await message.populate('replyTo', 'content sender');
          await message.populate('replyTo.sender', 'name role');

          // Update chat's last message
          await chat.updateLastMessage(message);

          // Increment unread counts for other participants
          await chat.incrementUnreadCount(socket.userId);

          // Emit message to all participants in the chat
          this.io.to(`chat_${chatId}`).emit('new_message', {
            message: {
              _id: message._id,
              content: message.content,
              type: message.type,
              sender: message.sender,
              replyTo: message.replyTo,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt
            },
            chatId
          });

          // Emit to admin monitoring room
          this.io.to('admin_monitoring').emit('admin_message_monitor', {
            message: {
              _id: message._id,
              content: message.content,
              type: message.type,
              sender: message.sender,
              replyTo: message.replyTo,
              createdAt: message.createdAt,
              updatedAt: message.updatedAt
            },
            chatId,
            chatTitle: chat.title || `Chat ${chatId}`,
            eventName: chat.event?.name || 'No Event'
          });

          // Emit unread count updates to participants
          for (const participant of chat.participants) {
            if (participant.user._id.toString() !== socket.userId) {
              const unreadCount = await chat.getUnreadCount(participant.user._id);
              this.io.to(`user_${participant.user._id}`).emit('unread_count_update', {
                chatId,
                unreadCount
              });
            }
          }

          console.log(`💬 Message sent in chat ${chatId} by ${socket.user.name}`);
        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        const { chatId } = data;
        if (socket.currentChatId === chatId) {
          socket.to(`chat_${chatId}`).emit('user_typing', {
            userId: socket.userId,
            userName: socket.user.name,
            chatId
          });
        }
      });

      socket.on('typing_stop', (data) => {
        const { chatId } = data;
        if (socket.currentChatId === chatId) {
          socket.to(`chat_${chatId}`).emit('user_stopped_typing', {
            userId: socket.userId,
            userName: socket.user.name,
            chatId
          });
        }
      });

      // Handle message reactions
      socket.on('add_reaction', async (data) => {
        try {
          const { messageId, emoji } = data;
          
          const message = await Message.findById(messageId);
          if (!message) {
            socket.emit('error', { message: 'Message not found' });
            return;
          }

          // Verify user is participant in the chat (or admin)
          const chat = await Chat.findById(message.chat);
          const isParticipant = chat.participants.some(p => p.user.toString() === socket.userId);
          const isAdmin = socket.user.role === 'admin';
          
          if (!isParticipant && !isAdmin) {
            socket.emit('error', { message: 'Not authorized' });
            return;
          }

          await message.addReaction(socket.userId, emoji);
          
          // Emit reaction to all participants
          this.io.to(`chat_${message.chat}`).emit('reaction_added', {
            messageId,
            userId: socket.userId,
            userName: socket.user.name,
            emoji,
            reactions: message.reactions
          });
        } catch (error) {
          console.error('Error adding reaction:', error);
          socket.emit('error', { message: 'Failed to add reaction' });
        }
      });

      // Handle message editing
      socket.on('edit_message', async (data) => {
        try {
          const { messageId, newContent } = data;
          
          const message = await Message.findById(messageId);
          if (!message) {
            socket.emit('error', { message: 'Message not found' });
            return;
          }

          if (message.sender.toString() !== socket.userId) {
            socket.emit('error', { message: 'Only the sender can edit the message' });
            return;
          }

          await message.editMessage(newContent, socket.userId);
          
          // Emit edited message to all participants
          this.io.to(`chat_${message.chat}`).emit('message_edited', {
            messageId,
            newContent,
            editedAt: message.editedAt
          });
        } catch (error) {
          console.error('Error editing message:', error);
          socket.emit('error', { message: 'Failed to edit message' });
        }
      });

      // Handle message deletion
      socket.on('delete_message', async (data) => {
        try {
          const { messageId } = data;
          
          const message = await Message.findById(messageId);
          if (!message) {
            socket.emit('error', { message: 'Message not found' });
            return;
          }

          if (message.sender.toString() !== socket.userId) {
            socket.emit('error', { message: 'Only the sender can delete the message' });
            return;
          }

          await message.deleteMessage(socket.userId);
          
          // Emit deleted message to all participants
          this.io.to(`chat_${message.chat}`).emit('message_deleted', {
            messageId
          });
        } catch (error) {
          console.error('Error deleting message:', error);
          socket.emit('error', { message: 'Failed to delete message' });
        }
      });

      // Handle user status updates
      socket.on('update_status', (data) => {
        const { status } = data;
        // Emit status update to all connected users
        this.io.emit('user_status_update', {
          userId: socket.userId,
          userName: socket.user.name,
          status
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`👤 User ${socket.user.name} (${socket.userId}) disconnected`);
        
        // Remove user from connected users
        this.connectedUsers.delete(socket.userId);
        this.userSockets.delete(socket.id);
        
        // Emit user offline status
        this.io.emit('user_offline', {
          userId: socket.userId,
          userName: socket.user.name
        });
      });
    });
  }

  // Utility methods
  getUserSocket(userId) {
    const socketId = this.connectedUsers.get(userId);
    return socketId ? this.io.sockets.sockets.get(socketId) : null;
  }

  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    const socket = this.getUserSocket(userId);
    if (socket) {
      socket.emit('notification', notification);
    }
  }

  // Send notification to all users in a chat
  sendNotificationToChat(chatId, notification) {
    this.io.to(`chat_${chatId}`).emit('notification', notification);
  }

  // Send notification to all admins
  sendNotificationToAdmins(notification) {
    this.io.to('admin_monitoring').emit('admin_notification', notification);
  }
}

// Export singleton instance
module.exports = new SocketService();
