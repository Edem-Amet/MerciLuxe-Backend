// utils/sendEmail.js
const nodemailer = require('nodemailer');
const logger = require('./Logger');

// Create email transporter
const createTransporter = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        logger.error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set');
        throw new Error('Email configuration missing. Please check your .env file');
    }

    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// Send email with retry
const sendEmail = async (options, retries = 3) => {
    let transporter;

    try {
        transporter = createTransporter();
    } catch (error) {
        logger.error(`Failed to create email transporter: ${error.message}`);
        throw error;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const mailOptions = {
                from: `"${process.env.EMAIL_SENDER_NAME || 'Merciluxe Admin System'}" <${process.env.EMAIL_USER}>`,
                to: options.email,
                subject: options.subject,
                html: options.html
            };

            const info = await transporter.sendMail(mailOptions);
            logger.info(`Email sent successfully to ${options.email}: ${options.subject}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error(`Email attempt ${attempt}/${retries} failed: ${error.message}`);

            if (attempt === retries) {
                logger.error(`All email attempts failed for ${options.email}`);
                throw error;
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
};


// Email Templates (unchanged, they look good)
const emailTemplates = {
    newRegistrationAlert: ({ principalName, newAdminName, newAdminEmail }) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #007bff; color: white; padding: 20px; text-align: center;">
                <h2>New Admin Registration Request</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
                <h3>Hello ${principalName},</h3>
                <p>A new admin registration request has been submitted and requires your approval.</p>
                
                <div style="background: white; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0;">
                    <strong>New Admin Details:</strong><br>
                    <strong>Name:</strong> ${newAdminName}<br>
                    <strong>Email:</strong> ${newAdminEmail}
                </div>
                
                <p>Please log in to the admin dashboard to approve or reject this registration.</p>
                
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${process.env.FRONTEND_URL || process.env.CLIENT_BASE_URL || 'http://localhost:5173'}/admin/login" 
                       style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                        Review Registration
                    </a>
                </div>
            </div>
            <div style="background: #6c757d; color: white; text-align: center; padding: 10px;">
                <small>Merciluxe Admin System</small>
            </div>
        </div>
    `,

    approvalNotification: ({ name, approvedBy }) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
                <h2>Registration Approved!</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
                <h3>Hello ${name},</h3>
                <p>Great news! Your admin registration has been approved by ${approvedBy}.</p>
                
                <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <strong>✅ Your account is now active!</strong><br>
                    You can now log in to the admin dashboard with your credentials.
                </div>
                
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${process.env.FRONTEND_URL || process.env.CLIENT_BASE_URL || 'http://localhost:5173'}/admin/login" 
                       style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                        Login to Dashboard
                    </a>
                </div>
            </div>
            <div style="background: #6c757d; color: white; text-align: center; padding: 10px;">
                <small>Merciluxe Admin System</small>
            </div>
        </div>
    `,

    rejectionNotification: ({ name, reason, rejectedBy }) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
                <h2>Registration Not Approved</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
                <h3>Hello ${name},</h3>
                <p>We regret to inform you that your admin registration request has not been approved.</p>
                
                <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <strong>Reason:</strong><br>
                    ${reason}
                </div>
                
                <p>If you believe this is an error, please contact the administration team.</p>
                <p><strong>Reviewed by:</strong> ${rejectedBy}</p>
            </div>
            <div style="background: #6c757d; color: white; text-align: center; padding: 10px;">
                <small>Merciluxe Admin System</small>
            </div>
        </div>
    `,

    passwordResetEmail: ({ name, code }) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #ffc107; color: #212529; padding: 20px; text-align: center;">
                <h2>Password Reset Request</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
                <h3>Hello ${name},</h3>
                <p>You requested to reset your password. Use the code below:</p>
                
                <div style="background: white; border: 2px dashed #ffc107; padding: 20px; text-align: center; margin: 20px 0;">
                    <h1 style="font-size: 32px; margin: 0; color: #212529; letter-spacing: 3px;">${code}</h1>
                </div>
                
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <strong>⏰ Important:</strong> This code expires in 15 minutes.
                </div>
                
                <p>If you didn't request this reset, please ignore this email.</p>
            </div>
            <div style="background: #6c757d; color: white; text-align: center; padding: 10px;">
                <small>Merciluxe Admin System</small>
            </div>
        </div>
    `,

    loginNotification: ({ name, deviceInfo, loginTime }) => `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #17a2b8; color: white; padding: 20px; text-align: center;">
                <h2>New Login Detected</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
                <h3>Hello ${name},</h3>
                <p>A new login was detected on your admin account.</p>
                
                <div style="background: white; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
                    <strong>Login Details:</strong><br>
                    <strong>Time:</strong> ${loginTime.toLocaleString()}<br>
                    <strong>IP:</strong> ${deviceInfo.ip || 'Unknown'}<br>
                    <strong>Location:</strong> ${deviceInfo.location || 'Unknown'}<br>
                    <strong>Device:</strong> ${deviceInfo.browser || 'Unknown'} on ${deviceInfo.os || 'Unknown'}
                </div>
                
                <p>If this wasn't you, please secure your account immediately.</p>
            </div>
            <div style="background: #6c757d; color: white; text-align: center; padding: 10px;">
                <small>Merciluxe Admin System</small>
            </div>
        </div>
    `
};

// Email sending functions with better error handling
const sendNewRegistrationAlert = async (data) => {
    try {
        await sendEmail({
            email: data.email,
            subject: 'New Admin Registration Pending Approval',
            html: emailTemplates.newRegistrationAlert(data)
        });
        return true;
    } catch (error) {
        logger.error(`Failed to send registration alert to ${data.email}: ${error.message}`);
        return false;
    }
};

const sendApprovalNotification = async (data) => {
    try {
        await sendEmail({
            email: data.email,
            subject: 'Admin Registration Approved - Welcome!',
            html: emailTemplates.approvalNotification(data)
        });
        return true;
    } catch (error) {
        logger.error(`Failed to send approval notification to ${data.email}: ${error.message}`);
        return false;
    }
};

const sendRejectionNotification = async (data) => {
    try {
        await sendEmail({
            email: data.email,
            subject: 'Admin Registration Status Update',
            html: emailTemplates.rejectionNotification(data)
        });
        return true;
    } catch (error) {
        logger.error(`Failed to send rejection notification to ${data.email}: ${error.message}`);
        return false;
    }
};

const sendPasswordResetEmail = async (data) => {
    try {
        await sendEmail({
            email: data.email,
            subject: 'Password Reset Code - Merciluxe Admin System',
            html: emailTemplates.passwordResetEmail(data)
        });
        return true;
    } catch (error) {
        logger.error(`Failed to send password reset email to ${data.email}: ${error.message}`);
        return false;
    }
};

const sendLoginNotification = async (data) => {
    try {
        await sendEmail({
            email: data.email,
            subject: 'New Login Alert - Admin Account',
            html: emailTemplates.loginNotification(data)
        });
        return true;
    } catch (error) {
        logger.error(`Failed to send login notification to ${data.email}: ${error.message}`);
        return false;
    }
};

module.exports = {
    sendNewRegistrationAlert,
    sendApprovalNotification,
    sendRejectionNotification,
    sendPasswordResetEmail,
    sendLoginNotification
};