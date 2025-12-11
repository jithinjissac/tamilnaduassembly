import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas', {
            // Connection pool settings optimized for Cloud Run
            maxPoolSize: 10,          // Reduced for faster connection
            minPoolSize: 2,           // Minimum connections
            maxIdleTimeMS: 30000,     // Close idle connections after 30s
            
            // Aggressive timeout settings for fast startup
            serverSelectionTimeoutMS: 3000,  // Reduced to 3s
            connectTimeoutMS: 3000,          // Connection timeout 3s
            socketTimeoutMS: 30000,          // Socket timeout 30s
            
            // Retry settings
            retryWrites: true,
            retryReads: true,
            
            // Compression for faster data transfer
            compressors: ['snappy', 'zlib'],
            
            // Read preference for better load balancing
            readPreference: 'primaryPreferred'
        });
        
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Connection Pool: Max ${10} connections`);
        
        // Disable debug logging in production for performance
        if (process.env.NODE_ENV !== 'production') {
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
        }
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        // Don't exit process in Cloud Run - let server continue for health checks
        throw error;
    }
};

export default connectDB;
