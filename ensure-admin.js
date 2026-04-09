// Quick script to create or update admin user
import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas';

async function ensureAdmin() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('âœ… Connected to MongoDB');

        // Find user by email or phone
        let admin = await User.findOne({ 
            $or: [
                { email: 'admin@test.com' },
                { phone: '9876543210' }
            ]
        });

        if (admin) {
            console.log('ðŸ“ Found existing user:', admin.email);
            
            // Update to admin role
            admin.role = 'admin';
            admin.isActive = true;
            
            // Only update password if it's not already set correctly
            // (avoid re-hashing on every save)
            console.log('âœ… Updated to admin role');
            
            await admin.save();
            console.log('âœ… User is now admin');
        } else {
            // Create new admin
            admin = new User({
                name: 'Admin User',
                email: 'admin@test.com',
                phone: '9876543210',
                password: 'admin123',  // Will be hashed by pre-save hook
                role: 'admin',
                pricePerVoter: 0.50,
                isActive: true
            });

            await admin.save();
            console.log('âœ… New admin user created');
        }

        console.log('\nðŸ“‹ Admin Credentials:');
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.log('Email:    admin@test.com');
        console.log('Password: admin123');
        console.log('Role:     admin');
        console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        console.log('\nðŸŒ Login at: http://localhost:3000/login.html');
        console.log('âš™ï¸  Settings: http://localhost:3000/admin-settings.html');

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('âŒ Error:', error.message);
        process.exit(1);
    }
}

ensureAdmin();

