// scripts/setupPrincipal.js
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminModel');
require('dotenv').config();

const createPrincipalAdmin = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database');

        // Check if principal admin already exists
        const existingPrincipal = await AdminUser.findOne({ role: 'principal' });
        if (existingPrincipal) {
            console.log('Principal admin already exists:', existingPrincipal.email);
            process.exit(0);
        }

        // Use the email you specified
        const name = process.argv[2] || 'Principal Admin';
        const email = 'merciluxe99@gmail.com'; // Fixed to use your email
        const password = process.argv[4] || 'Admin@2024';

        // Create principal admin
        const principalAdmin = new AdminUser({
            name,
            email: email.toLowerCase(),
            password,
            role: 'principal',
            status: 'approved',
            approvedBy: null,
            approvedAt: new Date()
        });

        await principalAdmin.save();

        console.log('\n✅ Principal Admin created successfully!');
        console.log('-----------------------------------');
        console.log('Name:', name);
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('Role: Principal Admin');
        console.log('\n🔐 Please login and change the default password!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating principal admin:', error.message);
        process.exit(1);
    }
};

// Run the script
createPrincipalAdmin();