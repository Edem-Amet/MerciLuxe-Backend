const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const AdminUser = require("./models/AdminModel"); // adjust path if needed

const mongoURI = 'mongodb+srv://merciluxe99:merciluxe%4099@merciluxe.plnffu3.mongodb.net/?retryWrites=true&w=majority&appName=MerciLuxe';


async function createAdmin() {
    try {
        await mongoose.connect(mongoURI);

        const existingAdmin = await AdminUser.findOne({ email: "merciluxe99@gmail.com" });
        if (existingAdmin) {
            console.log("Admin user already exists");
            process.exit();
        }


        const admin = new AdminUser({
            name: "MerciLuxe Admin",
            email: "merciluxe99@gmail.com",
            password: "admin123", // Plain text here — schema will hash it
            isVerified: true,
            isAdmin: true,
        });

        await admin.save();
        console.log("Admin user created successfully!");
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

createAdmin();
