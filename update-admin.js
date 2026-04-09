import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function updateAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');
        console.log('âœ… Connected to MongoDB\n');

        // Find the admin user
        const admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            console.log('âŒ No admin user found!');
            console.log('ðŸ’¡ Run: node ensure-admin.js to create one');
            process.exit(1);
        }

        console.log('ðŸ“‹ Current Admin Details:');
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.log('Email:   ', admin.email);
        console.log('Name:    ', admin.name || '(not set)');
        console.log('Phone:   ', admin.phone || '(not set)');
        console.log('Role:    ', admin.role);
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n');

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

        console.log('âœ… Admin details updated successfully!\n');
        console.log('ðŸ“‹ New Admin Details:');
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.log('Email:   ', admin.email);
        console.log('Name:    ', admin.name);
        console.log('Phone:   ', admin.phone);
        console.log('Role:    ', admin.role);
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n');

        console.log('ðŸŒ Login at: http://localhost:3000/login.html');
        
        process.exit(0);
    } catch (error) {
        console.error('âŒ Error:', error.message);
        process.exit(1);
    }
}

updateAdmin();

