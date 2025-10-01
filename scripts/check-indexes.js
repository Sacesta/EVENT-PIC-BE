const mongoose = require('mongoose');
require('dotenv').config();

const checkIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pic_app');
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    console.log('📊 Current indexes on users collection:');
    const indexes = await collection.indexes();
    
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });
    
    // Check for duplicate email indexes
    const emailIndexes = indexes.filter(index => 
      index.key && (index.key.email === 1 || index.key.email === -1)
    );
    
    if (emailIndexes.length > 1) {
      console.log('\n⚠️  Found duplicate email indexes:');
      emailIndexes.forEach((index, i) => {
        console.log(`   ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
      });
    } else {
      console.log('\n✅ No duplicate email indexes found');
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking indexes:', error);
    process.exit(1);
  }
};

checkIndexes();
