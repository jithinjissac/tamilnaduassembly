import mongoose from 'mongoose';
import User from './models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas';

async function createTestUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('âœ… Connected to MongoDB');

        // Create a test user
        const testUser = new User({
            name: 'Test User',
            email: 'test@example.com',
            password: 'test123',
            phone: '9876543210',
            role: 'user',
            pricePerVoter: 0.50,
            isActive: true
        });

        await testUser.save();
        console.log('âœ… Test user created successfully!');
        console.log('\nðŸ“‹ Test User Credentials:');
        console.log('Email:    test@example.com');
        console.log('Password: test123');
        console.log('Role:     user');

        // Verify password
        const verifyUser = await User.findOne({ email: 'test@example.com' });
        const isMatch = await verifyUser.comparePassword('test123');
        console.log(`\nðŸ” Password verification: ${isMatch ? 'âœ… SUCCESS' : 'âŒ FAILED'}`);

        await mongoose.connection.close();
        console.log('\nâœ… Done!');
        
    } catch (error) {
        console.error('âŒ Error:', error.message);
        process.exit(1);
    }
}

createTestUser();

