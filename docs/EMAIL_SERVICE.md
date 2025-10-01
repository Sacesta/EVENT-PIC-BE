# Email Service Documentation

## Overview

The Pic backend includes a comprehensive email service that handles user registration verification and password reset functionality. The service uses Nodemailer and supports both development (Ethereal Email) and production (SMTP) configurations.

## Features

- ✅ Email verification for new user registrations
- ✅ Password reset functionality
- ✅ Welcome emails after successful verification
- ✅ Beautiful HTML email templates
- ✅ Development and production email configurations
- ✅ Secure token generation and validation

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```env
# Email Configuration
EMAIL_FROM=noreply@pic.com
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Ethereal Email (for development testing)
ETHEREAL_USER=ethereal.user@ethereal.email
ETHEREAL_PASS=ethereal.pass
```

### Production Setup

For production, configure your SMTP settings:

1. **Gmail Setup:**
   - Enable 2-factor authentication
   - Generate an App Password
   - Use your Gmail address and app password

2. **Other SMTP Providers:**
   - Update the transporter configuration in `services/emailService.js`
   - Modify the service settings for your provider

## API Endpoints

### Email Verification

#### POST `/api/auth/verify-email`
Verify user email address with token.

**Request Body:**
```json
{
  "token": "verification_token_from_email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully. Welcome to Pic!",
  "data": {
    "user": { ... }
  }
}
```

#### POST `/api/auth/resend-verification`
Resend verification email (requires authentication).

**Response:**
```json
{
  "success": true,
  "message": "Verification email sent successfully"
}
```

### Password Reset

#### POST `/api/auth/forgot-password`
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent"
}
```

#### POST `/api/auth/reset-password`
Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "new_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

## Email Templates

The service includes three email templates:

1. **Verification Email** - Sent after user registration
2. **Password Reset Email** - Sent when user requests password reset
3. **Welcome Email** - Sent after successful email verification

All templates include:
- Responsive HTML design
- Plain text fallback
- Branded styling with Pic colors
- Security notices and expiration information

## Testing

### Development Testing

In development mode, the service uses Ethereal Email for testing:

```bash
# Run the email test script
node scripts/test-email.js
```

This will:
- Test email connection
- Send test emails
- Display preview URLs for Ethereal emails

### Production Testing

For production testing:
1. Configure your SMTP settings
2. Set `NODE_ENV=production`
3. Test with real email addresses

## Security Features

- **Token Expiration:** Verification tokens expire in 24 hours, reset tokens in 1 hour
- **Secure Hashing:** All tokens are hashed using SHA-256 before storage
- **Rate Limiting:** Consider implementing rate limiting for email endpoints
- **Email Validation:** Proper email format validation
- **No Information Leakage:** Password reset doesn't reveal if email exists

## Frontend Integration

The frontend should handle:

1. **Registration Flow:**
   - Show success message after registration
   - Display "Check your email" notification
   - Provide resend verification option

2. **Email Verification:**
   - Handle verification link clicks
   - Show success/error messages
   - Redirect to appropriate page

3. **Password Reset:**
   - Forgot password form
   - Reset password form with token
   - Success confirmation

## Error Handling

The service includes comprehensive error handling:

- Email sending failures don't break user registration
- Invalid/expired tokens return appropriate errors
- Network issues are handled gracefully
- Detailed logging for debugging

## Monitoring

Monitor email service health:

- Check email delivery rates
- Monitor bounce rates
- Track verification completion rates
- Set up alerts for email failures

## Future Enhancements

Potential improvements:

- Email templates customization
- Multi-language support
- Email analytics and tracking
- Advanced email providers (SendGrid, Mailgun)
- Email preferences management
- Bulk email capabilities
