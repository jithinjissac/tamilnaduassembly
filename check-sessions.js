import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkSessions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');
        console.log('Connected to MongoDB');
        
        const { default: UserSession } = await import('./models/UserSession.js');
        const now = new Date();
        
        // Get all sessions
        const allSessions = await UserSession.find({}).sort({lastActivity: -1});
        console.log(`\n=== Total Sessions: ${allSessions.length} ===`);
        
        // Get sessions with recent activity (last 30 minutes)
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const recentSessions = allSessions.filter(s => {
            const lastActivity = s.lastActivity || s.createdAt;
            return new Date(lastActivity) > thirtyMinutesAgo;
        });
        console.log(`Recent sessions (30min): ${recentSessions.length}`);
        
        // Get sessions with heartbeat in last 2 minutes
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        const heartbeatSessions = allSessions.filter(s => {
            return s.lastHeartbeat && new Date(s.lastHeartbeat) > twoMinutesAgo;
        });
        console.log(`Sessions with recent heartbeat (2min): ${heartbeatSessions.length}`);
        
        // Show recent sessions details
        console.log(`\n=== Recent Sessions Details ===`);
        const sessionsToShow = allSessions.slice(0, 5);
        sessionsToShow.forEach((s, i) => {
            const lastActivity = s.lastActivity || s.createdAt;
            const ageMinutes = Math.floor((now - new Date(lastActivity)) / (1000 * 60));
            const heartbeatAge = s.lastHeartbeat ? 
                Math.floor((now - new Date(s.lastHeartbeat)) / (1000 * 60)) + ' mins ago' : 
                'Never';
            
            console.log(`${i+1}. Session ${s._id.toString().slice(-8)}`);
            console.log(`   User: ${s.userId || 'Anonymous'}`);
            console.log(`   Last Activity: ${ageMinutes} mins ago`);
            console.log(`   Last Heartbeat: ${heartbeatAge}`);
            console.log(`   Status: ${s.isOnline ? 'Online' : 'Offline'}`);
            console.log('');
        });
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSessions();
