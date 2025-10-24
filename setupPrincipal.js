// setupPrincipal.js
require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('./models/AdminModel');
const logger = require('./utils/Logger');

async function createPrincipalAdmin() {
    try {
        console.log('\n🚀 Merciluxe Gifthub - Principal Admin Setup');
        console.log('=============================================\n');

        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI not found in environment variables');
        }

        console.log('📡 Connecting to database...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to database\n');

        const email = 'merciluxe99@gmail.com';
        const name = 'Principal Admin';
        const password = 'Mercy@1010';

        // Delete all existing principals
        const principals = await AdminUser.find({ role: 'principal' });
        if (principals.length > 0) {
            console.log(`⚠️  Found ${principals.length} existing principal admin(s). Deleting all...`);
            await AdminUser.deleteMany({ role: 'principal' });
        }

        // Delete any admin with same email
        const duplicateEmails = await AdminUser.find({ email: email.toLowerCase() });
        if (duplicateEmails.length > 0) {
            console.log(`⚠️  Found ${duplicateEmails.length} account(s) using this email (${email}). Deleting...`);
            await AdminUser.deleteMany({ email: email.toLowerCase() });
        }

        console.log('✅ Old conflicting records cleared.\n');

        // Validate
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) throw new Error('Invalid email format');
        if (password.length < 8) throw new Error('Password must be at least 8 characters long');

        console.log('👤 Creating new Principal Admin...');
        console.log('-----------------------------------');
        console.log('📧 Email:', email);
        console.log('👤 Name:', name);
        console.log('🔑 Password:', password);
        console.log('');

        const principalAdmin = new AdminUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: 'principal',
            status: 'approved',
            approvedBy: null,
            approvedAt: new Date(),
            isVerified: true,
            isDeleted: false,
            emailNotifications: {
                newLogin: true,
                newRegistration: true,
                securityAlerts: true,
                suspiciousActivity: true
            },
            securitySettings: {
                twoFactorEnabled: false,
                sessionTimeout: 24,
                maxLoginAttempts: 5,
                passwordExpiryDays: 90
            },
            lastLogin: new Date(),
            loginAttempts: 0,
            lockUntil: null
        });

        await principalAdmin.save();

        console.log('\n✅ Principal Admin Created Successfully!');
        console.log('=============================================');
        console.log('🏷️  System: Merciluxe Gifthub');
        console.log('📧 Email:', email);
        console.log('👤 Name:', name);
        console.log('🔑 Password:', password);
        console.log('👑 Role: Principal Admin');
        console.log('📅 Created:', new Date().toLocaleString());
        console.log('\n🔐 SECURITY NOTICE:');
        console.log('   • Change this password after first login');
        console.log('   • Enable two-factor authentication');
        console.log('   • Review security settings');
        console.log('\n🌐 Login URL:', process.env.FRONTEND_URL || 'http://localhost:5173/admin/login');
        console.log('=============================================\n');

        if (logger && typeof logger.success === 'function') {
            logger.success('Principal admin created for Merciluxe Gifthub', {
                email,
                name,
                system: 'Merciluxe Gifthub'
            });
        }

        await mongoose.connection.close();
        console.log('✅ Setup completed successfully!\n');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ Error creating principal admin:', err.message || err);
        if (logger && typeof logger.error === 'function') {
            logger.error('Principal admin setup failed for Merciluxe Gifthub', {
                error: err.message || err,
                system: 'Merciluxe Gifthub'
            });
        }

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('\n📖 Merciluxe Gifthub - Principal Admin Setup');
    console.log('=============================================\n');
    console.log('Usage: node setupPrincipal.js');
    console.log('\nDefault values:');
    console.log('  Email: merciluxe99@gmail.com');
    console.log('  Password: Mercy@1010');
    console.log('  Role: Principal Admin');
    console.log('  System: Merciluxe Gifthub\n');
    console.log('Options:');
    console.log('  --help, -h    Show this help message');
    console.log('\nSecurity:');
    console.log('  • Password meets security requirements');
    console.log('  • All existing principals are cleared');
    console.log('  • Duplicate emails are removed');
    console.log('  • Account is pre-approved and verified\n');
    process.exit(0);
}

// Show version info
if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log('Merciluxe Gifthub Principal Admin Setup v1.0.0');
    process.exit(0);
}

// Run the setup
createPrincipalAdmin();