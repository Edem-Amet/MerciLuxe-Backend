// utils/SendEmail.js
const nodemailer = require('nodemailer');
const logger = require('./logger');

// Create email transporter
const createTransporter = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        logger.error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set');
        throw new Error('Email configuration missing');
    }

    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100
    });
};

// Send email with retry mechanism
const sendEmail = async (options, retries = 3) => {
    let transporter;

    try {
        transporter = createTransporter();
    } catch (error) {
        logger.error(`Failed to create email transporter: ${error.message}`);
        return { success: false, error: error.message };
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const mailOptions = {
                from: `"${process.env.EMAIL_SENDER_NAME || 'Merciluxe Admin'}" <${process.env.EMAIL_USER}>`,
                to: options.email,
                subject: options.subject,
                html: options.html,
                priority: options.priority || 'normal'
            };

            const info = await transporter.sendMail(mailOptions);
            logger.info(`Email sent to ${options.email}: ${options.subject}`);

            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error(`Email attempt ${attempt}/${retries} failed: ${error.message}`);

            if (attempt === retries) {
                logger.error(`All email attempts failed for ${options.email}`);
                return { success: false, error: error.message };
            }

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
};

// Get frontend URL
const getFrontendUrl = () => {
    return process.env.FRONTEND_URL ||
        process.env.CLIENT_BASE_URL ||
        'http://localhost:5173';
};

// ===== EMAIL TEMPLATES =====
const emailTemplates = {
    // New Admin Registration Alert
    newRegistrationAlert: ({ principalName, newAdminName, newAdminEmail, registrationDate }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #000000 0%, #333333 100%); padding: 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        🔔 New Admin Registration
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${principalName},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        A new admin registration request has been submitted for <strong>Merciluxe</strong> and requires your approval.
                                    </p>
                                    
                                    <!-- Registration Details -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #f8f9fa; border-left: 4px solid #000000;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 10px 0; color: #333333; font-weight: 600;">Registration Details:</p>
                                                <p style="margin: 5px 0; color: #666666;"><strong>Name:</strong> ${newAdminName}</p>
                                                <p style="margin: 5px 0; color: #666666;"><strong>Email:</strong> ${newAdminEmail}</p>
                                                <p style="margin: 5px 0; color: #666666;"><strong>Date:</strong> ${new Date(registrationDate).toLocaleString()}</p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        Please log in to the admin dashboard to review and take action on this registration request.
                                    </p>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="margin: 30px 0;">
                                        <tr>
                                            <td align="center">
                                                <a href="${getFrontendUrl()}/admin/pending-registrations" 
                                                   style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #000000 0%, #333333 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
                                                    Review Registration →
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,

    // Admin Approval Notification
    approvalNotification: ({ name, approvedBy }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #000000 0%, #2d5016 100%); padding: 40px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        Registration Approved!
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${name},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        Great news! Your admin registration for <strong>Merciluxe</strong> has been approved.
                                    </p>
                                    
                                    <!-- Success Box -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px; text-align: center;">
                                                <p style="margin: 0; color: #166534; font-size: 18px; font-weight: 600;">
                                                    🎉 Your account is now active!
                                                </p>
                                                <p style="margin: 10px 0 0 0; color: #15803d; font-size: 14px;">
                                                    You can now log in to the admin dashboard
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin: 20px 0; color: #666666; font-size: 14px;">
                                        <strong>Approved by:</strong> ${approvedBy}
                                    </p>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="margin: 30px 0;">
                                        <tr>
                                            <td align="center">
                                                <a href="${getFrontendUrl()}/admin/login" 
                                                   style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #000000 0%, #2d5016 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
                                                    Login to Dashboard →
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,

    // Admin Rejection Notification
    rejectionNotification: ({ name, reason, rejectedBy }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 40px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 10px;">❌</div>
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        Registration Not Approved
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${name},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        We regret to inform you that your admin registration request for <strong>Merciluxe</strong> has not been approved at this time.
                                    </p>
                                    
                                    <!-- Reason Box -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 10px 0; color: #991b1b; font-weight: 600; font-size: 16px;">
                                                    Reason:
                                                </p>
                                                <p style="margin: 0; color: #b91c1c; font-size: 15px; line-height: 1.5;">
                                                    ${reason}
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin: 20px 0; color: #666666; font-size: 14px;">
                                        <strong>Reviewed by:</strong> ${rejectedBy}
                                    </p>
                                    
                                    <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        If you believe this is an error or would like to discuss this decision, please contact the administration team.
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,

    // Password Reset Email
    passwordResetEmail: ({ name, code }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #000000 0%, #4338ca 100%); padding: 40px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 10px;">🔑</div>
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        Password Reset Request
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${name},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        You requested to reset your password for your <strong>Merciluxe</strong> admin account. Use the verification code below:
                                    </p>
                                    
                                    <!-- Code Box -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                                        <tr>
                                            <td style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 3px dashed #000000; border-radius: 12px; padding: 30px; text-align: center;">
                                                <p style="margin: 0 0 15px 0; color: #374151; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                                    Your Reset Code
                                                </p>
                                                <div style="font-size: 42px; font-weight: 700; color: #000000; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                                    ${code}
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Warning Box -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                                                    ⏰ <strong>Important:</strong> This code expires in 15 minutes for security reasons.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        If you didn't request this password reset, please ignore this email and ensure your account is secure.
                                    </p>
                                    
                                    <!-- Security Note -->
                                    <p style="margin: 30px 0 0 0; padding: 15px; background-color: #f3f4f6; border-radius: 6px; color: #6b7280; font-size: 13px; line-height: 1.5;">
                                        🔒 <strong>Security Tip:</strong> Merciluxe will never ask for your password via email. If you receive suspicious emails, please report them immediately.
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,

    // Login Notification
    loginNotification: ({ name, deviceInfo, loginTime }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #000000 0%, #1e40af 100%); padding: 40px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 10px;">🔐</div>
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        New Login Detected
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${name},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        A new login was detected on your <strong>Merciluxe</strong> admin account.
                                    </p>
                                    
                                    <!-- Login Details -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #eff6ff; border-left: 4px solid #000000; border-radius: 4px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 15px 0; color: #1e40af; font-weight: 600; font-size: 16px;">
                                                    Login Details:
                                                </p>
                                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                                    <tr>
                                                        <td style="padding: 5px 0; color: #000000; font-weight: 600; width: 120px;">Time:</td>
                                                        <td style="padding: 5px 0; color: #475569;">${loginTime.toLocaleString()}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 5px 0; color: #000000; font-weight: 600;">IP Address:</td>
                                                        <td style="padding: 5px 0; color: #475569;">${deviceInfo.ip || 'Unknown'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 5px 0; color: #000000; font-weight: 600;">Location:</td>
                                                        <td style="padding: 5px 0; color: #475569;">${deviceInfo.location || 'Unknown'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 5px 0; color: #000000; font-weight: 600;">Browser:</td>
                                                        <td style="padding: 5px 0; color: #475569;">${deviceInfo.browser || 'Unknown'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 5px 0; color: #000000; font-weight: 600;">Device:</td>
                                                        <td style="padding: 5px 0; color: #475569;">${deviceInfo.os || 'Unknown'} - ${deviceInfo.deviceType || 'Unknown'}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Security Warning -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0; color: #991b1b; font-size: 15px; line-height: 1.6;">
                                                    ⚠️ <strong>If this wasn't you:</strong> Please secure your account immediately by changing your password and reviewing your active sessions.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="margin: 30px 0;">
                                        <tr>
                                            <td align="center">
                                                <a href="${getFrontendUrl()}/admin/security" 
                                                   style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #000000 0%, #1e40af 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
                                                    Review Security →
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,

    // Security Alert
    securityAlert: ({ name, threats, deviceInfo, timestamp }) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 40px; text-align: center;">
                                    <div style="font-size: 48px; margin-bottom: 10px;">🚨</div>
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                                        Security Alert
                                    </h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 22px;">
                                        Hello ${name},
                                    </h2>
                                    
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                                        We detected suspicious activity on your <strong>Merciluxe</strong> admin account that requires your attention.
                                    </p>
                                    
                                    <!-- Threats List -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #fef2f2; border: 2px solid #f87171; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 15px 0; color: #991b1b; font-weight: 600; font-size: 16px;">
                                                    🔍 Detected Issues:
                                                </p>
                                                <ul style="margin: 0; padding-left: 20px; color: #b91c1c;">
                                                    ${threats.map(threat => `<li style="margin: 8px 0; line-height: 1.5;">${threat}</li>`).join('')}
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Device Info -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #f3f4f6; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 15px 0; color: #374151; font-weight: 600;">
                                                    Activity Details:
                                                </p>
                                                <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">
                                                    <strong>Time:</strong> ${timestamp.toLocaleString()}
                                                </p>
                                                <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">
                                                    <strong>IP:</strong> ${deviceInfo.ip || 'Unknown'}
                                                </p>
                                                <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">
                                                    <strong>Location:</strong> ${deviceInfo.location || 'Unknown'}
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Recommended Actions -->
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <p style="margin: 0 0 15px 0; color: #92400e; font-weight: 600;">
                                                    Recommended Actions:
                                                </p>
                                                <ol style="margin: 0; padding-left: 20px; color: #b45309;">
                                                    <li style="margin: 8px 0;">Review your recent account activity</li>
                                                    <li style="margin: 8px 0;">Change your password if needed</li>
                                                    <li style="margin: 8px 0;">Review and terminate unknown sessions</li>
                                                    <li style="margin: 8px 0;">Contact support if you see unauthorized access</li>
                                                </ol>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="margin: 30px 0;">
                                        <tr>
                                            <td align="center">
                                                <a href="${getFrontendUrl()}/admin/security" 
                                                   style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(127, 29, 29, 0.3);">
                                                    Secure Account Now →
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 30px; text-align: center;">
                                    <p style="margin: 0; color: #cccccc; font-size: 14px;">
                                        Merciluxe Admin System
                                    </p>
                                    <p style="margin: 10px 0 0 0; color: #999999; font-size: 12px;">
                                        © ${new Date().getFullYear()} Merciluxe. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `
};

// ===== EXPORT EMAIL FUNCTIONS =====
const sendNewRegistrationAlert = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: '🔔 New Admin Registration - Merciluxe',
            html: emailTemplates.newRegistrationAlert(data),
            priority: 'high'
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send registration alert: ${error.message}`);
        return false;
    }
};

const sendApprovalNotification = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: '✅ Admin Registration Approved - Merciluxe',
            html: emailTemplates.approvalNotification(data)
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send approval notification: ${error.message}`);
        return false;
    }
};

const sendRejectionNotification = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: 'Admin Registration Status - Merciluxe',
            html: emailTemplates.rejectionNotification(data)
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send rejection notification: ${error.message}`);
        return false;
    }
};

const sendPasswordResetEmail = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: '🔑 Password Reset Code - Merciluxe',
            html: emailTemplates.passwordResetEmail(data),
            priority: 'high'
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send password reset email: ${error.message}`);
        return false;
    }
};

const sendLoginNotification = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: '🔐 New Login Alert - Merciluxe',
            html: emailTemplates.loginNotification(data)
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send login notification: ${error.message}`);
        return false;
    }
};

const sendSecurityAlert = async (data) => {
    try {
        const result = await sendEmail({
            email: data.email,
            subject: '🚨 Security Alert - Merciluxe',
            html: emailTemplates.securityAlert(data),
            priority: 'high'
        });
        return result.success;
    } catch (error) {
        logger.error(`Failed to send security alert: ${error.message}`);
        return false;
    }
};

module.exports = {
    sendNewRegistrationAlert,
    sendApprovalNotification,
    sendRejectionNotification,
    sendPasswordResetEmail,
    sendLoginNotification,
    sendSecurityAlert
};