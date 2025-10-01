const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Create transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration (using Hostinger SMTP)
      this.transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true, // SSL
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } else {
      // Development email configuration (using Ethereal Email for testing)
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
          pass: process.env.ETHEREAL_PASS || 'ethereal.pass'
        }
      });
    }
  }

  // Generate verification token
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate password reset token
  generatePasswordResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Send email verification
  async sendVerificationEmail(user, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: user.email,
      subject: 'Welcome to Pic - Verify Your Email',
      html: this.getVerificationEmailTemplate(user.name, verificationUrl),
      text: this.getVerificationEmailText(user.name, verificationUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // In development, log the preview URL for Ethereal emails
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: user.email,
      subject: 'Pic - Password Reset Request',
      html: this.getPasswordResetEmailTemplate(user.name, resetUrl),
      text: this.getPasswordResetEmailText(user.name, resetUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // In development, log the preview URL for Ethereal emails
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  // Send welcome email after successful verification
  async sendWelcomeEmail(user) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: user.email,
      subject: 'Welcome to Pic - Your Account is Ready!',
      html: this.getWelcomeEmailTemplate(user.name, user.role),
      text: this.getWelcomeEmailText(user.name, user.role)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // In development, log the preview URL for Ethereal emails
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  // Send supplier approval email
  async sendSupplierApprovalEmail(user) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: user.email,
      subject: 'Congratulations! Your Supplier Account has been Approved - Pic',
      html: this.getSupplierApprovalEmailTemplate(user.name),
      text: this.getSupplierApprovalEmailText(user.name)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // In development, log the preview URL for Ethereal emails
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending supplier approval email:', error);
      throw new Error('Failed to send supplier approval email');
    }
  }

  // Send supplier rejection email
  async sendSupplierRejectionEmail(user, reason = '') {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: user.email,
      subject: 'Update on Your Supplier Application - Pic',
      html: this.getSupplierRejectionEmailTemplate(user.name, reason),
      text: this.getSupplierRejectionEmailText(user.name, reason)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      // In development, log the preview URL for Ethereal emails
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending supplier rejection email:', error);
      throw new Error('Failed to send supplier rejection email');
    }
  }

  // Email templates
  getVerificationEmailTemplate(name, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - Pic</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to Pic!</h1>
          <p>Event Management Platform</p>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>Thank you for registering with Pic. To complete your registration and start using our platform, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          
          <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
          
          <p><strong>Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
          
          <p>If you didn't create an account with Pic, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© 2024 Pic. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  getVerificationEmailText(name, verificationUrl) {
    return `
Welcome to Pic!

Hi ${name}!

Thank you for registering with Pic. To complete your registration and start using our platform, please verify your email address by visiting this link:

${verificationUrl}

Important: This verification link will expire in 24 hours for security reasons.

If you didn't create an account with Pic, please ignore this email.

© 2024 Pic. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  getPasswordResetEmailTemplate(name, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - Pic</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset Request</h1>
          <p>Pic Event Management Platform</p>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>We received a request to reset your password for your Pic account. If you made this request, click the button below to reset your password:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
          
          <div class="warning">
            <p><strong>Security Notice:</strong></p>
            <ul>
              <li>This password reset link will expire in 1 hour for security reasons</li>
              <li>If you didn't request a password reset, please ignore this email</li>
              <li>Your password will remain unchanged until you create a new one</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>© 2024 Pic. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetEmailText(name, resetUrl) {
    return `
Password Reset Request - Pic

Hi ${name}!

We received a request to reset your password for your Pic account. If you made this request, visit this link to reset your password:

${resetUrl}

Security Notice:
- This password reset link will expire in 1 hour for security reasons
- If you didn't request a password reset, please ignore this email
- Your password will remain unchanged until you create a new one

© 2024 Pic. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  getWelcomeEmailTemplate(name, role) {
    const roleText = role === 'producer' ? 'Event Producer' : 'Service Supplier';
    const roleDescription = role === 'producer' 
      ? 'You can now create and manage events, connect with suppliers, and grow your business.'
      : 'You can now showcase your services, connect with event producers, and grow your business.';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Pic!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #667eea; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎉 Welcome to Pic!</h1>
          <p>Your account is now verified and ready to use</p>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          <p>Congratulations! Your email has been verified and your Pic account is now active. You're all set to start using our platform as a <strong>${roleText}</strong>.</p>
          
          <p>${roleDescription}</p>
          
          <div class="feature">
            <h3>🚀 What's Next?</h3>
            <p>Log in to your account and complete your profile to get the most out of Pic:</p>
            <ul>
              <li>Add your profile picture and company information</li>
              <li>Set up your preferences and notifications</li>
              <li>Explore the platform and connect with other users</li>
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/login" class="button">Get Started</a>
          </div>
          
          <p>If you have any questions or need help getting started, don't hesitate to reach out to our support team.</p>
        </div>
        <div class="footer">
          <p>© 2024 Pic. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  getWelcomeEmailText(name, role) {
    const roleText = role === 'producer' ? 'Event Producer' : 'Service Supplier';
    const roleDescription = role === 'producer' 
      ? 'You can now create and manage events, connect with suppliers, and grow your business.'
      : 'You can now showcase your services, connect with event producers, and grow your business.';

    return `
🎉 Welcome to Pic!

Hi ${name}!

Congratulations! Your email has been verified and your Pic account is now active. You're all set to start using our platform as a ${roleText}.

${roleDescription}

What's Next?
Log in to your account and complete your profile to get the most out of Pic:
- Add your profile picture and company information
- Set up your preferences and notifications
- Explore the platform and connect with other users

Get started: ${process.env.FRONTEND_URL}/login

If you have any questions or need help getting started, don't hesitate to reach out to our support team.

© 2024 Pic. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  // Supplier approval email template
  getSupplierApprovalEmailTemplate(name) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Supplier Account Approved - Pic</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #28a745; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎉 Congratulations!</h1>
          <p>Your Supplier Account has been Approved</p>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          
          <div class="success-box">
            <p><strong>Great news!</strong> Your supplier application has been reviewed and approved by our team. You can now start offering your services on the Pic platform!</p>
          </div>
          
          <div class="feature">
            <h3>🚀 What You Can Do Now:</h3>
            <ul>
              <li><strong>Create Services:</strong> Add your service offerings with detailed descriptions and pricing</li>
              <li><strong>Manage Bookings:</strong> Receive and manage event booking requests from producers</li>
              <li><strong>Build Your Profile:</strong> Showcase your portfolio and experience</li>
              <li><strong>Connect with Producers:</strong> Network with event organizers looking for your services</li>
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/supplier/dashboard" class="button">Access Your Dashboard</a>
          </div>
          
          <p>We're excited to have you as part of the Pic community! If you have any questions or need assistance getting started, our support team is here to help.</p>
          
          <p>Welcome aboard!</p>
        </div>
        <div class="footer">
          <p>© 2024 Pic. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  getSupplierApprovalEmailText(name) {
    return `
🎉 Congratulations! Your Supplier Account has been Approved

Hi ${name}!

Great news! Your supplier application has been reviewed and approved by our team. You can now start offering your services on the Pic platform!

What You Can Do Now:
- Create Services: Add your service offerings with detailed descriptions and pricing
- Manage Bookings: Receive and manage event booking requests from producers
- Build Your Profile: Showcase your portfolio and experience
- Connect with Producers: Network with event organizers looking for your services

Access your dashboard: ${process.env.FRONTEND_URL}/supplier/dashboard

We're excited to have you as part of the Pic community! If you have any questions or need assistance getting started, our support team is here to help.

Welcome aboard!

© 2024 Pic. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  getSupplierRejectionEmailTemplate(name, reason) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Update on Your Supplier Application - Pic</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .info-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #667eea; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Update on Your Application</h1>
          <p>Pic Supplier Registration</p>
        </div>
        <div class="content">
          <h2>Hi ${name}!</h2>
          
          <p>Thank you for your interest in becoming a supplier on the Pic platform. After careful review of your application, we are unable to approve your supplier account at this time.</p>
          
          ${reason ? `
          <div class="info-box">
            <p><strong>Reason for this decision:</strong></p>
            <p>${reason}</p>
          </div>
          ` : ''}
          
          <div class="feature">
            <h3>📝 What's Next?</h3>
            <p>Don't worry! You can reapply in the future. Here are some suggestions to improve your application:</p>
            <ul>
              <li>Ensure all required information is complete and accurate</li>
              <li>Provide detailed descriptions of your services and experience</li>
              <li>Include portfolio samples or references if applicable</li>
              <li>Make sure your business documentation is up to date</li>
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/supplier/register" class="button">Reapply Now</a>
          </div>
          
          <p>If you have any questions about this decision or need clarification on how to improve your application, please don't hesitate to contact our support team.</p>
          
          <p>Thank you for your understanding.</p>
        </div>
        <div class="footer">
          <p>© 2024 Pic. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;
  }

  getSupplierRejectionEmailText(name, reason) {
    return `
Update on Your Supplier Application - Pic

Hi ${name}!

Thank you for your interest in becoming a supplier on the Pic platform. After careful review of your application, we are unable to approve your supplier account at this time.

${reason ? `Reason for this decision: ${reason}` : ''}

What's Next?
Don't worry! You can reapply in the future. Here are some suggestions to improve your application:
- Ensure all required information is complete and accurate
- Provide detailed descriptions of your services and experience
- Include portfolio samples or references if applicable
- Make sure your business documentation is up to date

Reapply here: ${process.env.FRONTEND_URL}/supplier/register

If you have any questions about this decision or need clarification on how to improve your application, please don't hesitate to contact our support team.

Thank you for your understanding.

© 2024 Pic. All rights reserved.
This is an automated message, please do not reply to this email.
    `;
  }

  // Test email configuration
  async testConnection() {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();
