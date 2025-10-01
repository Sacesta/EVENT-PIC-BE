const emailService = require('../services/emailService');
require('dotenv').config();

async function testEmailService() {
  console.log('🧪 Testing Email Service...\n');

  // Test connection
  console.log('1. Testing email connection...');
  const connectionTest = await emailService.testConnection();
  if (!connectionTest) {
    console.log('❌ Email connection failed. Please check your email configuration.');
    return;
  }
  console.log('✅ Email connection successful\n');

  // Test verification email
  console.log('2. Testing verification email...');
  const testUser = {
    name: 'Test User',
    email: 'test@example.com',
    role: 'producer'
  };
  
  const verificationToken = emailService.generateVerificationToken();
  
  try {
    await emailService.sendVerificationEmail(testUser, verificationToken);
    console.log('✅ Verification email test successful\n');
  } catch (error) {
    console.log('❌ Verification email test failed:', error.message, '\n');
  }

  // Test password reset email
  console.log('3. Testing password reset email...');
  try {
    await emailService.sendPasswordResetEmail(testUser, verificationToken);
    console.log('✅ Password reset email test successful\n');
  } catch (error) {
    console.log('❌ Password reset email test failed:', error.message, '\n');
  }

  // Test welcome email
  console.log('4. Testing welcome email...');
  try {
    await emailService.sendWelcomeEmail(testUser);
    console.log('✅ Welcome email test successful\n');
  } catch (error) {
    console.log('❌ Welcome email test failed:', error.message, '\n');
  }

  console.log('🎉 Email service testing completed!');
  console.log('\n📧 In development mode, check the console for Ethereal email preview URLs');
  console.log('📧 In production mode, emails will be sent to the configured SMTP server');
}

// Run the test
testEmailService().catch(console.error);
