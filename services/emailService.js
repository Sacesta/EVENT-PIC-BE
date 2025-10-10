const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
    
    // PIC Brand Colors
    this.colors = {
      primary: '#031760',
      primaryLight: '#31A7FF',
      accent: '#FF4553',
      accentOrange: '#FF994D',
      secondaryGreen: '#10DF73',
      secondaryRed: '#E21E1E',
      background: '#FCFCFC',
      text: '#031760',
      muted: '#6D7280',
      border: '#E5E7EB',
      white: '#FFFFFF'
    };
  }

  initializeTransporter() {
    // Debug: Log environment variables
    console.log('\n🔍 EMAIL SERVICE DEBUG - Environment Variables:');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('SMTP_HOST:', process.env.SMTP_HOST || 'not set (will use default: smtppro.zoho.com)');
    console.log('SMTP_PORT:', process.env.SMTP_PORT || 'not set (will use default: 465)');
    console.log('SMTP_SECURE:', process.env.SMTP_SECURE || 'not set (will use default: true)');
    console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'not set');
    console.log('EMAIL_USER:', process.env.EMAIL_USER || 'not set');
    console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '***SET*** (length: ' + process.env.EMAIL_PASSWORD.length + ')' : 'not set');
    console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'not set');
    
    // Create transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      console.log('\n📧 Initializing PRODUCTION email transporter (Zoho SMTP)');
      
      const config = {
        host: process.env.SMTP_HOST || 'smtppro.zoho.com',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true' || true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        },
        debug: true,
        logger: true
      };
      
      console.log('📋 Transporter Config:', {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user,
        passwordLength: config.auth.pass ? config.auth.pass.length : 0
      });
      
      this.transporter = nodemailer.createTransport(config);
    } else {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        console.log('\n📧 Initializing DEVELOPMENT email transporter (Zoho SMTP with credentials)');
        
        const config = {
          host: process.env.SMTP_HOST || 'smtppro.zoho.com',
          port: parseInt(process.env.SMTP_PORT) || 465,
          secure: process.env.SMTP_SECURE === 'true' || true,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          },
          tls: {
            rejectUnauthorized: false
          },
          debug: true,
          logger: true
        };
        
        console.log('📋 Transporter Config:', {
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.auth.user,
          passwordLength: config.auth.pass ? config.auth.pass.length : 0
        });
        
        this.transporter = nodemailer.createTransport(config);
      } else {
        console.log('\n📧 Initializing DEVELOPMENT email transporter (Ethereal Email - no credentials provided)');
        
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
            pass: process.env.ETHEREAL_PASS || 'ethereal.pass'
          },
          debug: true,
          logger: true
        });
      }
    }
    
    console.log('✅ Email transporter initialized\n');
  }

  // Base email template with PIC branding
  getBaseEmailTemplate(content, headerTitle = 'PIC Event Planning') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${headerTitle}</title>
        <style>
          body {
            font-family: 'Mazzard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: ${this.colors.text};
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: ${this.colors.background};
          }
          .email-container {
            background: ${this.colors.white};
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(3, 23, 96, 0.1);
          }
          .header {
            background: linear-gradient(135deg, ${this.colors.primary} 0%, ${this.colors.primaryLight} 100%);
            color: ${this.colors.white};
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            font-family: 'Conthrax', sans-serif;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .header p {
            margin: 10px 0 0 0;
            font-size: 16px;
            opacity: 0.95;
          }
          .content {
            padding: 40px 30px;
          }
          .content h2 {
            color: ${this.colors.primary};
            font-size: 24px;
            margin: 0 0 20px 0;
            font-weight: 600;
          }
          .content p {
            margin: 0 0 15px 0;
            color: ${this.colors.text};
            font-size: 16px;
          }
          .button {
            display: inline-block;
            background: linear-gradient(to right, ${this.colors.primary}, ${this.colors.primaryLight});
            color: ${this.colors.white} !important;
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            box-shadow: 0 4px 6px -1px rgba(3, 23, 96, 0.2);
          }
          .button-secondary {
            background: linear-gradient(to right, ${this.colors.accent}, ${this.colors.accentOrange});
          }
          .info-box {
            background: ${this.colors.background};
            border-left: 4px solid ${this.colors.primaryLight};
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
          }
          .success-box {
            background: #d4edda;
            border-left: 4px solid ${this.colors.secondaryGreen};
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
          }
          .warning-box {
            background: #fff3cd;
            border-left: 4px solid ${this.colors.accentOrange};
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
          }
          .feature-list {
            background: ${this.colors.white};
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            border: 1px solid ${this.colors.border};
          }
          .footer {
            background: ${this.colors.background};
            padding: 30px;
            text-align: center;
            border-top: 1px solid ${this.colors.border};
          }
          .footer p {
            margin: 5px 0;
            color: ${this.colors.muted};
            font-size: 14px;
          }
          @media only screen and (max-width: 600px) {
            body { padding: 10px; }
            .header { padding: 30px 20px; }
            .header h1 { font-size: 24px; }
            .content { padding: 30px 20px; }
            .button { display: block; padding: 14px 24px; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          ${content}
        </div>
      </body>
      </html>
    `;
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
      subject: 'Welcome to PIC - Verify Your Email',
      html: this.getVerificationEmailTemplate(user.name, verificationUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
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
      subject: 'PIC - Password Reset Request',
      html: this.getPasswordResetEmailTemplate(user.name, resetUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
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
      subject: 'Welcome to PIC - Your Account is Ready!',
      html: this.getWelcomeEmailTemplate(user.name, user.role)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
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
      subject: 'Congratulations! Your Supplier Account has been Approved - PIC',
      html: this.getSupplierApprovalEmailTemplate(user.name)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
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
      subject: 'Update on Your Supplier Application - PIC',
      html: this.getSupplierRejectionEmailTemplate(user.name, reason)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending supplier rejection email:', error);
      throw new Error('Failed to send supplier rejection email');
    }
  }

  // EMAIL TEMPLATES WITH PIC BRANDING

  getVerificationEmailTemplate(name, verificationUrl) {
    const content = `
      <div class="header">
        <h1>Welcome to PIC!</h1>
        <p>Event Management Platform</p>
      </div>
      <div class="content">
        <h2>Hi ${name}!</h2>
        <p>Thank you for registering with PIC. To complete your registration and start using our platform, please verify your email address by clicking the button below:</p>
        
        <div style="text-align: center;">
          <a href="${verificationUrl}" class="button">Verify Email Address</a>
        </div>
        
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <div class="info-box">
          <p style="word-break: break-all; margin: 0;">${verificationUrl}</p>
        </div>
        
        <div class="warning-box">
          <p><strong>Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
        </div>
        
        <p>If you didn't create an account with PIC, please ignore this email.</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Verify Your Email - PIC');
  }

  getPasswordResetEmailTemplate(name, resetUrl) {
    const content = `
      <div class="header">
        <h1>Password Reset</h1>
        <p>PIC Event Management Platform</p>
      </div>
      <div class="content">
        <h2>Hi ${name}!</h2>
        <p>We received a request to reset your password for your PIC account. If you made this request, click the button below to reset your password:</p>
        
        <div style="text-align: center;">
          <a href="${resetUrl}" class="button">Reset Password</a>
        </div>
        
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <div class="info-box">
          <p style="word-break: break-all; margin: 0;">${resetUrl}</p>
        </div>
        
        <div class="warning-box">
          <p><strong>Security Notice:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>This password reset link will expire in 1 hour for security reasons</li>
            <li>If you didn't request a password reset, please ignore this email</li>
            <li>Your password will remain unchanged until you create a new one</li>
          </ul>
        </div>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Password Reset - PIC');
  }

  getWelcomeEmailTemplate(name, role) {
    const roleText = role === 'producer' ? 'Event Producer' : 'Service Supplier';
    const roleDescription = role === 'producer' 
      ? 'You can now create and manage events, connect with suppliers, and grow your business.'
      : 'You can now showcase your services, connect with event producers, and grow your business.';
    const dashboardUrl = role === 'producer' ? '/producer/dashboard' : '/supplier/dashboard';

    const content = `
      <div class="header">
        <h1>🎉 Welcome to PIC!</h1>
        <p>Your account is now verified and ready to use</p>
      </div>
      <div class="content">
        <h2>Hi ${name}!</h2>
        <p>Congratulations! Your email has been verified and your PIC account is now active. You're all set to start using our platform as a <strong>${roleText}</strong>.</p>
        
        <p>${roleDescription}</p>
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">🚀 What's Next?</h3>
          <p>Log in to your account and complete your profile to get the most out of PIC:</p>
          <ul>
            <li>Add your profile picture and company information</li>
            <li>Set up your preferences and notifications</li>
            <li>Explore the platform and connect with other users</li>
            ${role === 'producer' ? '<li>Create your first event and invite suppliers</li>' : '<li>Add your services and start receiving bookings</li>'}
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}" class="button">Get Started</a>
        </div>
        
        <p>If you have any questions or need help getting started, don't hesitate to reach out to our support team.</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Welcome to PIC!');
  }

  getSupplierApprovalEmailTemplate(name) {
    const content = `
      <div class="header">
        <h1>🎉 Congratulations!</h1>
        <p>Your Supplier Account has been Approved</p>
      </div>
      <div class="content">
        <h2>Hi ${name}!</h2>
        
        <div class="success-box">
          <p style="margin: 0;"><strong>Great news!</strong> Your supplier application has been reviewed and approved by our team. You can now start offering your services on the PIC platform!</p>
        </div>
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.secondaryGreen}; margin-top: 0;">🚀 What You Can Do Now:</h3>
          <ul>
            <li><strong>Create Services:</strong> Add your service offerings with detailed descriptions and pricing</li>
            <li><strong>Manage Bookings:</strong> Receive and manage event booking requests from producers</li>
            <li><strong>Build Your Profile:</strong> Showcase your portfolio and experience</li>
            <li><strong>Connect with Producers:</strong> Network with event organizers looking for your services</li>
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL} class="button" style="background: linear-gradient(to right, ${this.colors.secondaryGreen}, ${this.colors.primaryLight});">Access Your Dashboard</a>
        </div>
        
        <p>We're excited to have you as part of the PIC community! If you have any questions or need assistance getting started, our support team is here to help.</p>
        
        <p><strong>Welcome aboard!</strong></p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Supplier Account Approved - PIC');
  }

  getSupplierRejectionEmailTemplate(name, reason) {
    const content = `
      <div class="header">
        <h1>Update on Your Application</h1>
        <p>PIC Supplier Registration</p>
      </div>
      <div class="content">
        <h2>Hi ${name}!</h2>
        
        <p>Thank you for your interest in becoming a supplier on the PIC platform. After careful review of your application, we are unable to approve your supplier account at this time.</p>
        
        ${reason ? `
        <div class="warning-box">
          <p style="margin: 0 0 10px 0;"><strong>Reason for this decision:</strong></p>
          <p style="margin: 0;">${reason}</p>
        </div>
        ` : ''}
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📝 What's Next?</h3>
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
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Update on Your Supplier Application - PIC');
  }

  // Send event created confirmation to producer
  async sendEventCreatedEmail(producer, event) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: producer.email,
      subject: `Event Created Successfully: ${event.name} - PIC`,
      html: this.getEventCreatedEmailTemplate(producer.name, event)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending event created email:', error);
      throw new Error('Failed to send event created email');
    }
  }

  // Send event invitation to supplier
  async sendEventInvitationEmail(supplier, event, producer, service) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: supplier.email,
      subject: `New Event Invitation: ${event.name} - PIC`,
      html: this.getEventInvitationEmailTemplate(supplier.name, event, producer, service)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending event invitation email:', error);
      throw new Error('Failed to send event invitation email');
    }
  }

  // Send supplier approved event notification to producer
  async sendSupplierApprovedEventEmail(producer, event, supplier, service) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: producer.email,
      subject: `Supplier Approved Your Event: ${event.name} - PIC`,
      html: this.getSupplierApprovedEventEmailTemplate(producer.name, event, supplier, service)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending supplier approved event email:', error);
      throw new Error('Failed to send supplier approved event email');
    }
  }

  // Send supplier rejected event notification to producer
  async sendSupplierRejectedEventEmail(producer, event, supplier, service) {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@pic.com',
      to: producer.email,
      subject: `Supplier Declined Your Event: ${event.name} - PIC`,
      html: this.getSupplierRejectedEventEmailTemplate(producer.name, event, supplier, service)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending supplier rejected event email:', error);
      throw new Error('Failed to send supplier rejected event email');
    }
  }

  // EVENT EMAIL TEMPLATES

  getEventCreatedEmailTemplate(producerName, event) {
    const eventDate = new Date(event.startDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const content = `
      <div class="header">
        <h1>🎉 Event Created!</h1>
        <p>Your event has been successfully created</p>
      </div>
      <div class="content">
        <h2>Hi ${producerName}!</h2>
        
        <div class="success-box">
          <p style="margin: 0;"><strong>Great news!</strong> Your event "${event.name}" has been created successfully on the PIC platform!</p>
        </div>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📅 Event Details</h3>
          <p style="margin: 5px 0;"><strong>Event Name:</strong> ${event.name}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${event.location.city}, ${event.location.address}</p>
          <p style="margin: 5px 0;"><strong>Category:</strong> ${event.category}</p>
          ${event.suppliers && event.suppliers.length > 0 ? `<p style="margin: 5px 0;"><strong>Suppliers Invited:</strong> ${event.suppliers.length}</p>` : ''}
        </div>
        
        ${event.suppliers && event.suppliers.length > 0 ? `
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📧 Invitations Sent</h3>
          <p>We've sent invitations to ${event.suppliers.length} supplier(s) for your event. You'll receive notifications when they respond.</p>
        </div>
        ` : ''}
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">🚀 What's Next?</h3>
          <ul>
            <li>Monitor supplier responses in your dashboard</li>
            <li>Add more suppliers if needed</li>
            <li>Update event details anytime</li>
            <li>Communicate with suppliers through the platform</li>
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/events/${event._id}" class="button">View Event Details</a>
        </div>
        
        <p>If you have any questions or need assistance, our support team is here to help.</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Event Created Successfully - PIC');
  }

  getEventInvitationEmailTemplate(supplierName, event, producer, service) {
    const eventDate = new Date(event.startDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const content = `
      <div class="header">
        <h1>🎊 New Event Invitation!</h1>
        <p>You've been invited to provide services for an event</p>
      </div>
      <div class="content">
        <h2>Hi ${supplierName}!</h2>
        
        <p>Great news! <strong>${producer.name}</strong> has invited you to provide <strong>${service.title}</strong> services for their upcoming event.</p>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📅 Event Details</h3>
          <p style="margin: 5px 0;"><strong>Event Name:</strong> ${event.name}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${event.location.city}, ${event.location.address}</p>
          <p style="margin: 5px 0;"><strong>Category:</strong> ${event.category}</p>
          <p style="margin: 5px 0;"><strong>Producer:</strong> ${producer.name}</p>
        </div>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.primaryLight}; margin-top: 0;">🎯 Service Requested</h3>
          <p style="margin: 5px 0;"><strong>Service:</strong> ${service.title}</p>
          <p style="margin: 5px 0;"><strong>Category:</strong> ${service.category}</p>
          ${service.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${service.description}</p>` : ''}
        </div>
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">⏰ Action Required</h3>
          <p>Please review the event details and respond to this invitation:</p>
          <ul>
            <li><strong>Accept:</strong> If you're available and interested in providing your services</li>
            <li><strong>Decline:</strong> If you're not available or the event doesn't fit your schedule</li>
          </ul>
          <p style="margin-top: 15px;"><strong>Note:</strong> Responding promptly helps producers plan their events better!</p>
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/supplier/events" class="button">View Invitation</a>
        </div>
        
        <p>If you have any questions about this event, you can communicate with the producer through the platform.</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'New Event Invitation - PIC');
  }

  getSupplierApprovedEventEmailTemplate(producerName, event, supplier, service) {
    const eventDate = new Date(event.startDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const content = `
      <div class="header">
        <h1>✅ Supplier Accepted!</h1>
        <p>Great news about your event</p>
      </div>
      <div class="content">
        <h2>Hi ${producerName}!</h2>
        
        <div class="success-box">
          <p style="margin: 0;"><strong>Excellent news!</strong> ${supplier.name} has accepted your invitation to provide services for "${event.name}"!</p>
        </div>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📅 Event Details</h3>
          <p style="margin: 5px 0;"><strong>Event Name:</strong> ${event.name}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${event.location.city}</p>
        </div>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.secondaryGreen}; margin-top: 0;">✅ Confirmed Service</h3>
          <p style="margin: 5px 0;"><strong>Supplier:</strong> ${supplier.name}</p>
          <p style="margin: 5px 0;"><strong>Service:</strong> ${service.title}</p>
          <p style="margin: 5px 0;"><strong>Category:</strong> ${service.category}</p>
        </div>
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">🚀 What's Next?</h3>
          <ul>
            <li>Review the service details and pricing</li>
            <li>Communicate with the supplier through the platform</li>
            <li>Finalize the booking and payment terms</li>
            <li>Keep track of all your confirmed suppliers in your dashboard</li>
          </ul>
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/events/${event._id}" class="button">View Event Details</a>
        </div>
        
        <p>Your event is coming together! If you need any assistance, our support team is here to help.</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Supplier Accepted Your Event - PIC');
  }

  getSupplierRejectedEventEmailTemplate(producerName, event, supplier, service) {
    const eventDate = new Date(event.startDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const content = `
      <div class="header">
        <h1>📋 Supplier Response</h1>
        <p>Update on your event invitation</p>
      </div>
      <div class="content">
        <h2>Hi ${producerName}!</h2>
        
        <p>We wanted to let you know that <strong>${supplier.name}</strong> has declined the invitation to provide services for "${event.name}".</p>
        
        <div class="info-box">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">📅 Event Details</h3>
          <p style="margin: 5px 0;"><strong>Event Name:</strong> ${event.name}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${event.location.city}</p>
        </div>
        
        <div class="warning-box">
          <h3 style="color: ${this.colors.accentOrange}; margin-top: 0;">⚠️ Declined Service</h3>
          <p style="margin: 5px 0;"><strong>Supplier:</strong> ${supplier.name}</p>
          <p style="margin: 5px 0;"><strong>Service:</strong> ${service.title}</p>
          <p style="margin: 5px 0;"><strong>Category:</strong> ${service.category}</p>
        </div>
        
        <div class="feature-list">
          <h3 style="color: ${this.colors.primary}; margin-top: 0;">🔍 Find Alternative Suppliers</h3>
          <p>Don't worry! There are many other qualified suppliers on PIC who can provide the services you need:</p>
          <ul>
            <li>Browse our supplier directory for similar services</li>
            <li>Check supplier ratings and reviews</li>
            <li>Send invitations to multiple suppliers</li>
            <li>Compare pricing and availability</li>
          </ul>
        </div>
        
   
        
        <p>Need help finding the right supplier? Our support team is here to assist you!</p>
      </div>
      <div class="footer">
        <p>© 2024 PIC Event Planning. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    `;
    
    return this.getBaseEmailTemplate(content, 'Supplier Declined Your Event - PIC');
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
