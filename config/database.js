const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // Modern MongoDB connection settings with retry logic
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/pic_app',
      {
        serverSelectionTimeoutMS: 30000, // 30 seconds
        socketTimeoutMS: 45000, // 45 seconds
        maxPoolSize: 10, // Maintain up to 10 socket connections
        minPoolSize: 5, // Maintain a minimum of 5 socket connections
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        connectTimeoutMS: 30000, // Give up initial connection after 30 seconds
        retryWrites: true, // Enable retryable writes
        retryReads: true, // Enable retryable reads
      }
    ); 

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`); 
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
    console.error('❌ Full error:', error);
    process.exit(1);
  }
};

module.exports = { connectDB }; 