// Reset admin password
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function resetAdminPassword() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Hash the new password
        const newPassword = 'admin123';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update admin user password
        const result = await User.updateOne(
            { email: 'techiussolutions@gmail.com' },
            { password: hashedPassword }
        );
        
        console.log('Update result:', result);
        
        if (result.modifiedCount > 0) {
            console.log('✅ Admin password reset to: admin123');
        } else {
            console.log('❌ No user was updated');
        }
        
        // Also reset the test admin
        const result2 = await User.updateOne(
            { email: 'admin@test.com' },
            { password: hashedPassword }
        );
        
        if (result2.modifiedCount > 0) {
            console.log('✅ Test admin password also reset to: admin123');
        }
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

resetAdminPassword();