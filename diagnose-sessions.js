import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function diagnoseSessions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kerala-voter-db');
        console.log('Connected to MongoDB');
        
        const { default: UserSession } = await import('./models/UserSession.js');
        const now = new Date();
        console.log(`Current time: ${now.toISOString()}`);
        
        // Get a few sessions to examine their data
        const sessions = await UserSession.find({})
            .sort({ lastActivity: -1 })
            .limit(3)
            .lean();
        
        console.log(`\n=== Session Data Analysis ===`);
        sessions.forEach((session, i) => {
            console.log(`\nSession ${i + 1}:`);
            console.log(`  _id: ${session._id}`);
            console.log(`  userId: ${session.userId}`);
            console.log(`  createdAt: ${session.createdAt}`);
            console.log(`  lastActivity: ${session.lastActivity}`);
            console.log(`  lastHeartbeat: ${session.lastHeartbeat}`);
            console.log(`  isPageVisible: ${session.isPageVisible}`);
            console.log(`  isPageFocused: ${session.isPageFocused}`);
            console.log(`  isOnline: ${session.isOnline}`);
            console.log(`  isActive: ${session.isActive}`);
            
            // Check data types and values
            if (session.lastHeartbeat) {
                const heartbeatDate = new Date(session.lastHeartbeat);
                const timeDiff = now - heartbeatDate;
                const minutesDiff = Math.floor(timeDiff / (1000 * 60));
                console.log(`  Heartbeat Date Object: ${heartbeatDate.toISOString()}`);
                console.log(`  Time difference: ${timeDiff}ms (${minutesDiff} minutes)`);
                console.log(`  Is heartbeat in future?: ${heartbeatDate > now}`);
            }
        });
        
        // Check the current filtering logic
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        console.log(`\n=== Time Thresholds ===`);
        console.log(`Now: ${now.toISOString()}`);
        console.log(`2 minutes ago: ${twoMinutesAgo.toISOString()}`);
        console.log(`30 minutes ago: ${thirtyMinutesAgo.toISOString()}`);
        
        // Test the filtering query
        const testQuery = await UserSession.find({
            isActive: true,
            $or: [
                { lastHeartbeat: { $gte: thirtyMinutesAgo } },
                { lastActivity: { $gte: thirtyMinutesAgo } }
            ]
        }).lean();
        
        console.log(`\n=== Query Results ===`);
        console.log(`Sessions matching filter: ${testQuery.length}`);
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

diagnoseSessions();