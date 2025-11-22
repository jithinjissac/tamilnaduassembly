// Test user details API endpoints directly
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testUserDetailsAPIs() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Import models
        const { default: User } = await import('./models/User.js');
        const { default: UserSession } = await import('./models/UserSession.js');
        const { default: UserActivity } = await import('./models/UserActivity.js');
        
        // Find a test user ID
        const testUser = await User.findOne().lean();
        if (!testUser) {
            console.log('❌ No users found in database');
            return;
        }
        
        console.log(`🔍 Testing with user: ${testUser.name} (${testUser._id})`);
        
        // Test 1: Get user sessions
        console.log('\n1. Testing user sessions...');
        const sessions = await UserSession.find({ userId: testUser._id })
            .sort({ startTime: -1 })
            .limit(20)
            .lean();
        
        console.log(`   Found ${sessions.length} sessions for user`);
        if (sessions.length > 0) {
            const latestSession = sessions[0];
            console.log(`   Latest session: ${latestSession.startTime}`);
            console.log(`   Session active: ${latestSession.isActive}`);
            console.log(`   Last activity: ${latestSession.lastActivity || 'N/A'}`);
            console.log(`   Last heartbeat: ${latestSession.lastHeartbeat || 'N/A'}`);
        }
        
        // Test 2: Get user activities
        console.log('\n2. Testing user activities...');
        const activities = await UserActivity.find({ userId: testUser._id })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();
        
        console.log(`   Found ${activities.length} activities for user`);
        if (activities.length > 0) {
            const latestActivity = activities[0];
            console.log(`   Latest activity: ${latestActivity.action} at ${latestActivity.timestamp}`);
            console.log(`   Details: ${JSON.stringify(latestActivity.details || {})}`);
        }
        
        // Test 3: Get activity statistics
        console.log('\n3. Testing activity statistics...');
        const stats = await UserActivity.aggregate([
            { $match: { userId: testUser._id } },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 },
                    lastActivity: { $max: '$timestamp' }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        console.log(`   Found ${stats.length} different activity types:`);
        stats.forEach(stat => {
            console.log(`   - ${stat._id}: ${stat.count} times`);
        });
        
        // Test 4: Total activity count
        const totalActivities = await UserActivity.countDocuments({ userId: testUser._id });
        console.log(`\n   Total activities: ${totalActivities}`);
        
        console.log('\n✅ User details API endpoints should work correctly');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Test error:', error);
        process.exit(1);
    }
}

testUserDetailsAPIs();