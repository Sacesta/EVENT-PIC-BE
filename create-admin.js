const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/pic_app',
      {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        connectTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true,
      }
    );
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Create the specific admin user
const createAdminUser = async () => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: 'root@admin.com' },
        { _id: '68b5ee3ec437702d3619c3c0' }
      ]
    });

    if (existingUser) {
      console.log('⚠️  User already exists:');
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   ID: ${existingUser._id}`);
      
      // Ask if user wants to update
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question('Do you want to update this user? (y/n): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        // Update existing user
        existingUser.name = 'root';
        existingUser.email = 'root@admin.com';
        existingUser.password = '68fc0043340225398a406f51b4d4a402'; // This will be hashed by pre-save middleware
        existingUser.role = 'admin';
        existingUser.isVerified = true;
        existingUser.verificationStatus = 'approved';
        existingUser.isActive = true;

        await existingUser.save();
        console.log('✅ User updated successfully!');
        console.log(`   Name: ${existingUser.name}`);
        console.log(`   Email: ${existingUser.email}`);
        console.log(`   Role: ${existingUser.role}`);
        console.log(`   ID: ${existingUser._id}`);
      } else {
        console.log('❌ Operation cancelled');
      }
    } else {
      // Create new user with specific ID
      const adminUser = new User({
        _id: new mongoose.Types.ObjectId('68b5ee3ec437702d3619c3c0'),
        name: 'root',
        email: 'root@admin.com',
        password: '68fc0043340225398a406f51b4d4a402', // This will be hashed by pre-save middleware
        role: 'admin',
        isVerified: true,
        verificationStatus: 'approved',
        isActive: true,
        language: 'en'
      });

      await adminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log(`   Name: ${adminUser.name}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Role: ${adminUser.role}`);
      console.log(`   ID: ${adminUser._id}`);
    }
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.code === 11000) {
      console.error('   This usually means the email or ID already exists');
    }
  }
};

// Main function
const main = async () => {
  console.log('🚀 Starting admin user creation...');
  
  await connectDB();
  await createAdminUser();
  
  console.log('🏁 Process completed');
  process.exit(0);
};

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main();
}

module.exports = { createAdminUser, connectDB };