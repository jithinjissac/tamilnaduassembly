// Script to create admin user
import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// MongoDB connection string - uses same connection as your app
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas';

async function createAdminUser() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ email: 'admin@test.com' });
        if (existingAdmin) {
            console.log('⚠️ Admin user already exists!');
            console.log('Email:', existingAdmin.email);
            console.log('Name:', existingAdmin.name);
            console.log('Role:', existingAdmin.role);
            
            // Update to admin if not already
            if (existingAdmin.role !== 'admin') {
                existingAdmin.role = 'admin';
                existingAdmin.pricePerVoter = 0.50;
                existingAdmin.isActive = true;
                await existingAdmin.save();
                console.log('✅ Updated existing user to admin role');
            }
        } else {
            // Create new admin user
            const adminUser = new User({
                name: 'Admin User',
                email: 'admin@test.com',
                password: '$2b$10$KIVqhMeutnZtFu806VkRVuMHNXwuFtW/ZbCas0Omo9q0MzGXBF3va', // admin123
                phone: '9876543210',
                role: 'admin',
                pricePerVoter: 0.50,
                isActive: true
            });

            await adminUser.save();
            console.log('✅ Admin user created successfully!');
        }

        console.log('\n📋 Admin Login Credentials:');
        console.log('================================');
        console.log('Email:    admin@test.com');
        console.log('Password: admin123');
        console.log('================================');
        console.log('\n🌐 Access URLs:');
        console.log('Login:    http://localhost:3000/login.html');
        console.log('Admin:    http://localhost:3000/admin.html');
        console.log('\n⚠️ IMPORTANT: Change this password after first login!');

        // Close connection
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        process.exit(1);
    }
}

// Run the script
createAdminUser();
