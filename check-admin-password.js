// Check existing admin user password hash
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkAdminPassword() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const adminUser = await User.findOne({ email: 'techiussolutions@gmail.com' });
        if (adminUser) {
            console.log('Admin user found:', adminUser.email);
            console.log('Password hash:', adminUser.password);
            
            // Try common passwords
            const commonPasswords = ['admin123', '123456', 'password', 'admin', 'techius@123', 'techiussolutions'];
            
            for (const password of commonPasswords) {
                try {
                    const isMatch = await bcrypt.compare(password, adminUser.password);
                    if (isMatch) {
                        console.log(`✅ CORRECT PASSWORD FOUND: ${password}`);
                        break;
                    } else {
                        console.log(`❌ Wrong password: ${password}`);
                    }
                } catch (error) {
                    console.log(`❌ Error testing password ${password}:`, error.message);
                }
            }
        } else {
            console.log('Admin user not found');
        }
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAdminPassword();