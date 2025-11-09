// Verify admin user and password
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas';

async function verifyAdmin() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const admin = await User.findOne({ email: 'admin@test.com' });
        
        if (!admin) {
            console.log('❌ Admin user not found!');
            console.log('Run: node create-admin.js to create one');
        } else {
            console.log('✅ Admin user found:');
            console.log('Name:', admin.name);
            console.log('Email:', admin.email);
            console.log('Role:', admin.role);
            console.log('Price per voter:', admin.pricePerVoter);
            console.log('Is active:', admin.isActive);
            console.log('\n🔐 Testing password...');
            
            const isMatch = await bcrypt.compare('admin123', admin.password);
            console.log('Password "admin123" matches:', isMatch ? '✅ YES' : '❌ NO');
            
            if (!isMatch) {
                console.log('\n⚠️ Password does not match!');
                console.log('Stored hash:', admin.password);
                console.log('\n🔄 Updating password to "admin123"...');
                
                // Use updateOne to bypass the pre-save hook that would hash it again
                await User.updateOne(
                    { email: 'admin@test.com' },
                    { $set: { password: await bcrypt.hash('admin123', 10) } }
                );
                
                console.log('✅ Password updated successfully!');
                console.log('\nTry logging in again with:');
                console.log('Email: admin@test.com');
                console.log('Password: admin123');
            }
        }

        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

verifyAdmin();
