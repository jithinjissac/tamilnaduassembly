import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function updateAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kerala-sec');
        console.log('✅ Connected to MongoDB\n');

        // Find the admin user
        const admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            console.log('❌ No admin user found!');
            console.log('💡 Run: node ensure-admin.js to create one');
            process.exit(1);
        }

        console.log('📋 Current Admin Details:');
        console.log('════════════════════════════════');
        console.log('Email:   ', admin.email);
        console.log('Name:    ', admin.name || '(not set)');
        console.log('Phone:   ', admin.phone || '(not set)');
        console.log('Role:    ', admin.role);
        console.log('════════════════════════════════\n');

        // Update details (modify these values as needed)
        const updates = {
            email: 'admin@easyslip.com',        // Change this
            name: 'Admin User',                  // Change this
            phone: '9876543210',                 // Change this (optional)
            // Uncomment to change password:
            // password: await bcrypt.hash('newpassword123', 10)
        };

        // Apply updates
        Object.assign(admin, updates);
        await admin.save();

        console.log('✅ Admin details updated successfully!\n');
        console.log('📋 New Admin Details:');
        console.log('════════════════════════════════');
        console.log('Email:   ', admin.email);
        console.log('Name:    ', admin.name);
        console.log('Phone:   ', admin.phone);
        console.log('Role:    ', admin.role);
        console.log('════════════════════════════════\n');

        console.log('🌐 Login at: http://localhost:3000/login.html');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

updateAdmin();
