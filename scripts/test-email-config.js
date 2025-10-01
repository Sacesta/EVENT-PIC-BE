const emailService = require('../services/emailService');

async function testEmailConfiguration() {
  console.log('🔧 Testing Email Configuration...\n');

  try {
    // Test SMTP connection
    console.log('1. Testing SMTP connection...');
    const connectionTest = await emailService.testConnection();
    
    if (connectionTest) {
      console.log('✅ SMTP connection successful!');
    } else {
      console.log('❌ SMTP connection failed!');
      return;
    }

    // Test email templates (mock data)
    console.log('\n2. Testing email templates...');
    
    const mockUser = {
      name: 'Test Supplier',
      email: 'test@example.com',
      role: 'supplier'
    };

    // Test approval email template
    try {
      const approvalTemplate = emailService.getSupplierApprovalEmailTemplate(mockUser.name);
      console.log('✅ Supplier approval email template generated successfully');
    } catch (error) {
      console.log('❌ Error generating approval email template:', error.message);
    }

    // Test rejection email template
    try {
      const rejectionTemplate = emailService.getSupplierRejectionEmailTemplate(mockUser.name, 'Test rejection reason');
      console.log('✅ Supplier rejection email template generated successfully');
    } catch (error) {
      console.log('❌ Error generating rejection email template:', error.message);
    }

    // Test verification email template
    try {
      const verificationTemplate = emailService.getVerificationEmailTemplate(mockUser.name, 'http://test-url.com');
      console.log('✅ Verification email template generated successfully');
    } catch (error) {
      console.log('❌ Error generating verification email template:', error.message);
    }

    console.log('\n3. Environment Variables Check:');
    console.log(`EMAIL_FROM: ${process.env.EMAIL_FROM || 'Not set'}`);
    console.log(`EMAIL_USER: ${process.env.EMAIL_USER || 'Not set'}`);
    console.log(`EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '***SET***' : 'Not set'}`);
    console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL || 'Not set'}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);

    console.log('\n🎉 Email configuration test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Set up your .env file with actual Hostinger credentials');
    console.log('2. Test sending actual emails');
    console.log('3. Verify admin approval/rejection workflow');

  } catch (error) {
    console.error('❌ Email configuration test failed:', error);
  }
}

// Run the test
testEmailConfiguration().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Test script error:', error);
  process.exit(1);
});
