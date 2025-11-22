// Simple API test script
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testAdminAPIs() {
    console.log('🔍 Testing Admin APIs...\n');
    
    try {
        // Try to login first
        console.log('1. Testing login...');
        const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emailOrPhone: 'techiussolutions@gmail.com',
                password: 'admin123'  // Try common password first
            })
        });
        
        let loginResult;
        try {
            loginResult = await loginResponse.json();
        } catch (e) {
            console.log('   ❌ Login response not JSON:', await loginResponse.text());
            return;
        }
        
        if (loginResult.status !== 'success') {
            console.log('   ❌ Login failed:', loginResult.message);
            
            // Try different passwords
            const passwords = ['admin123', '123456', 'techius@123', 'techiussolutions'];
            console.log('\n   Trying different passwords...');
            
            for (const password of passwords) {
                try {
                    const tryResponse = await fetch('http://localhost:3000/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            emailOrPhone: 'techiussolutions@gmail.com',
                            password: password
                        })
                    });
                    
                    const tryResult = await tryResponse.json();
                    if (tryResult.status === 'success') {
                        console.log(`   ✅ Login successful with password: ${password}`);
                        loginResult = tryResult;
                        break;
                    } else {
                        console.log(`   ❌ Failed with password: ${password} - ${tryResult.message}`);
                    }
                } catch (e) {
                    console.log(`   ❌ Error with password ${password}:`, e.message);
                }
            }
            
            if (loginResult.status !== 'success') {
                console.log('\n❌ Could not login with any password. Checking database...');
                
                // Check what admin users exist
                const mongoose = await import('mongoose');
                const User = await import('./models/User.js');
                
                await mongoose.default.connect(process.env.MONGODB_URI);
                const adminUsers = await User.default.find({role: 'admin'});
                
                console.log('\n   Admin users in database:');
                adminUsers.forEach(user => {
                    console.log(`   - Email: ${user.email}, Name: ${user.name}, Active: ${user.isActive}`);
                });
                
                await mongoose.default.connection.close();
                return;
            }
        } else {
            console.log('   ✅ Login successful!');
        }
        
        const token = loginResult.token;
        const headers = { 'Authorization': `Bearer ${token}` };
        
        console.log('\n2. Testing /admin/users API...');
        const usersResponse = await fetch('http://localhost:3000/api/admin/users', { headers });
        const usersResult = await usersResponse.json();
        
        if (usersResult.status === 'success') {
            console.log(`   ✅ Users API working - Found ${usersResult.count} users`);
            console.log(`   First user: ${usersResult.users?.[0]?.name || 'N/A'}`);
        } else {
            console.log('   ❌ Users API failed:', usersResult.message);
        }
        
        console.log('\n3. Testing /admin/sessions API...');
        const sessionsResponse = await fetch('http://localhost:3000/api/admin/sessions', { headers });
        const sessionsResult = await sessionsResponse.json();
        
        console.log('   Sessions API response structure:');
        console.log(`   - Status: ${sessionsResult.status}`);
        console.log(`   - Has data: ${!!sessionsResult.data}`);
        
        if (sessionsResult.data) {
            console.log(`   - Total active sessions: ${sessionsResult.data.totalActiveSessions || 0}`);
            console.log(`   - Truly online sessions: ${sessionsResult.data.trulyOnlineSessions || 0}`);
            console.log(`   - Sessions array length: ${sessionsResult.data.sessions?.length || 0}`);
            
            if (sessionsResult.data.sessions?.length > 0) {
                const firstSession = sessionsResult.data.sessions[0];
                console.log('   - First session sample:');
                console.log(`     * User: ${firstSession.userId?.name || 'N/A'}`);
                console.log(`     * Status: ${firstSession.onlineStatus || 'N/A'}`);
                console.log(`     * Last activity: ${firstSession.lastActivity || 'N/A'}`);
                console.log(`     * Last heartbeat: ${firstSession.lastHeartbeat || 'N/A'}`);
            }
        } else {
            console.log('   ❌ Sessions API failed:', sessionsResult.message);
        }
        
        console.log('\n4. Testing /admin/activity/recent API...');
        const activityResponse = await fetch('http://localhost:3000/api/admin/activity/recent', { headers });
        const activityResult = await activityResponse.json();
        
        if (activityResult.status === 'success') {
            console.log(`   ✅ Activity API working - Found ${activityResult.activities?.length || 0} activities`);
        } else {
            console.log('   ❌ Activity API failed:', activityResult.message);
        }
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testAdminAPIs();