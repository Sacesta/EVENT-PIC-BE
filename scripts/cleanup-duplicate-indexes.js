const mongoose = require('mongoose');
require('dotenv').config();

const cleanupDuplicateIndexes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pic_app');
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    console.log('📊 Checking current indexes...');
    const indexes = await collection.indexes();
    
    // Find duplicate email indexes
    const emailIndexes = indexes.filter(index => 
      index.key && (index.key.email === 1 || index.key.email === -1)
    );
    
    console.log(`Found ${emailIndexes.length} email indexes:`);
    emailIndexes.forEach((index, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });
    
    if (emailIndexes.length > 1) {
      console.log('\n🧹 Removing duplicate email indexes...');
      
      // Keep the first one (usually the unique index), remove the rest
      for (let i = 1; i < emailIndexes.length; i++) {
        const indexToRemove = emailIndexes[i];
        console.log(`Removing index: ${indexToRemove.name}`);
        
        try {
          await collection.dropIndex(indexToRemove.name);
          console.log(`✅ Successfully removed index: ${indexToRemove.name}`);
        } catch (error) {
          console.log(`⚠️  Could not remove index ${indexToRemove.name}: ${error.message}`);
        }
      }
    } else {
      console.log('\n✅ No duplicate email indexes found');
    }
    
    console.log('\n✅ Index cleanup completed');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during index cleanup:', error);
    process.exit(1);
  }
};

cleanupDuplicateIndexes();
