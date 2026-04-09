import fetch from 'node-fetch';

async function testHeartbeat() {
    try {
        console.log('Testing heartbeat system...');
        
        // Send a heartbeat request
        const response = await fetch('http://localhost:3000/api/activity/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                isPageVisible: true,
                isPageFocused: true,
                userAgent: 'Test Script',
                currentUrl: 'http://localhost:3000/test'
            })
        });
        
        const result = await response.json();
        console.log('Heartbeat response:', result);
        
        if (result.status === 'success') {
            console.log('âœ… Heartbeat sent successfully');
            console.log(`Session ID: ${result.sessionId}`);
            
            // Wait a moment then check the session
            setTimeout(async () => {
                console.log('\nChecking session after heartbeat...');
                
                const mongoose = await import('mongoose');
                await mongoose.default.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');
                
                const { default: UserSession } = await import('./models/UserSession.js');
                const session = await UserSession.findById(result.sessionId).lean();
                
                if (session) {
                    console.log('Session after heartbeat:');
                    console.log(`  lastHeartbeat: ${session.lastHeartbeat}`);
                    console.log(`  isPageVisible: ${session.isPageVisible}`);
                    console.log(`  isPageFocused: ${session.isPageFocused}`);
                    
                    const now = new Date();
                    const heartbeatAge = Math.floor((now - new Date(session.lastHeartbeat)) / 1000);
                    console.log(`  Heartbeat age: ${heartbeatAge} seconds`);
                } else {
                    console.log('âŒ Session not found');
                }
                
                await mongoose.default.connection.close();
                process.exit(0);
            }, 1000);
        } else {
            console.log('âŒ Heartbeat failed:', result);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Error testing heartbeat:', error);
        process.exit(1);
    }
}

testHeartbeat();
