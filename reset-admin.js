// Reset admin user - delete and recreate
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas';

async function resetAdmin() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('âœ… Connected to MongoDB\n');

        // Delete existing admin user
        await User.deleteOne({ email: 'admin@test.com' });
        console.log('ðŸ—‘ï¸ Deleted old admin user\n');

        // Create fresh admin user (pre-save hook will hash the plain password)
        const adminUser = new User({
            name: 'Admin User',
            email: 'admin@test.com',
            password: 'admin123', // Plain text - will be hashed by pre-save hook
            phone: '9876543210',
            role: 'admin',
            pricePerVoter: 0.50,
            isActive: true
        });

        await adminUser.save();
        console.log('âœ… Admin user created successfully!\n');

        // Verify the password works
        const verifyUser = await User.findOne({ email: 'admin@test.com' });
        const isMatch = await verifyUser.comparePassword('admin123');
        
        console.log('ðŸ” Password verification:', isMatch ? 'âœ… SUCCESS' : 'âŒ FAILED');
        
        if (isMatch) {
            console.log('\nðŸ“‹ Admin Login Credentials:');
            console.log('================================');
            console.log('Email:    admin@test.com');
            console.log('Password: admin123');
            console.log('================================');
            console.log('\nðŸŒ Login at: http://localhost:3000/login.html');
            console.log('ðŸŒ Admin at: http://localhost:3000/admin.html');
        }

        await mongoose.connection.close();
        console.log('\nâœ… Database connection closed');
        process.exit(0);

    } catch (error) {
        console.error('âŒ Error:', error.message);
        process.exit(1);
    }
}

resetAdmin();

