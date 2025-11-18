import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas', {
            // Connection pool settings for 20 concurrent users
            maxPoolSize: 25,          // Maximum connections in pool (25 for 20 users + buffer)
            minPoolSize: 5,           // Minimum connections to maintain
            maxIdleTimeMS: 30000,     // Close idle connections after 30s
            
            // Timeout settings
            serverSelectionTimeoutMS: 5000,  // Timeout for initial connection (5s)
            socketTimeoutMS: 45000,          // Socket timeout (45s)
            
            // Retry settings
            retryWrites: true,
            retryReads: true,
            
            // Compression for faster data transfer
            compressors: ['snappy', 'zlib'],
            
            // Read preference for better load balancing
            readPreference: 'primaryPreferred'
        });
        
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Connection Pool: Max ${25} connections (optimized for 20+ concurrent users)`);
        
        // Log slow queries (queries taking more than 100ms)
        mongoose.set('debug', (collectionName, method, query, doc) => {
            const threshold = 100; // ms
            const start = Date.now();
            setImmediate(() => {
                const duration = Date.now() - start;
                if (duration > threshold) {
                    console.warn(`⚠️ Slow Query (${duration}ms): ${collectionName}.${method}`, JSON.stringify(query));
                }
            });
        });
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

export default connectDB;
