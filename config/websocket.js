const config = require('./environment');

// WebSocket configuration for different environments
const websocketConfig = {
  // For local development
  development: {
    type: 'socketio',
    url: config.BACKEND_URL,
    options: {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    }
  },
  
  // For Vercel production
  production: {
    type: 'external', // Use external service like Pusher, Ably, or Socket.io Cloud
    // Example with Pusher
    pusher: {
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'us2',
      useTLS: true
    },
    // Example with Socket.io Cloud
    socketio: {
      url: process.env.SOCKETIO_CLOUD_URL,
      options: {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      }
    }
  }
};

module.exports = websocketConfig;
