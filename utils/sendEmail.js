const nodemailer = require('nodemailer');
const logger = require('./logger');

// Configure email transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// Email template generators
const emailTemplates = {
    verificationEmail: ({ name, verificationUrl }) => `
    <h2>Hello ${name},</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="${verificationUrl}">Verify Email</a></p>
    <p>If you didn't request this, please ignore this email.</p>
  `,
    passwordResetEmail: ({ name, code }) => `
    <h2>Hello ${name},</h2>
    <p>You requested to reset your password. Here's your verification code:</p>
    <h3>${code}</h3>
    <p>This code will expire in 15 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `
};

// Send email with error handling
const sendEmail = async (options) => {
    const transporter = createTransporter();

    try {
        await transporter.sendMail({
            from: `"${process.env.EMAIL_SENDER_NAME || 'System'}" <${process.env.EMAIL_USER}>`,
            to: options.email,
            subject: options.subject,
            html: options.html
        });
        return true;
    } catch (error) {
        logger.error(`Email sending error: ${error.message}`);
        throw new Error('Failed to send email');
    }
};

// Specific email functions
const sendVerificationEmail = async ({ email, name, token }) => {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    return sendEmail({
        email,
        subject: 'Verify Your Email Address',
        html: emailTemplates.verificationEmail({ name, verificationUrl })
    });
};

const sendPasswordResetEmail = async ({ email, name, code }) => {
    return sendEmail({
        email,
        subject: 'Your Password Reset Code',
        html: emailTemplates.passwordResetEmail({ name, code })
    });
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail
};