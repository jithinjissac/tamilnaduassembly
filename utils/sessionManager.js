/**
 * Session Manager
 * Manages active browser sessions with automatic expiration and cleanup
 * - Prevents memory leaks from abandoned sessions
 * - Automatic cleanup of expired sessions
 * - Tracks session metadata
 */
class SessionManager {
  constructor(sessionTimeout = 5 * 60 * 1000) { // 5 minutes default
    this.sessions = new Map();
    this.sessionTimeout = sessionTimeout;
    this.cleanupInterval = null;
    
    this.startCleanup();
    console.log(`📋 Session Manager initialized (timeout: ${sessionTimeout / 1000}s)`);
  }

  /**
   * Create a new session
   * @param {string} sessionId - Unique session identifier
   * @param {Object} context - Browser context
   * @param {Object} page - Playwright page
   * @param {Object} metadata - Additional session metadata
   * @param {number} customTimeout - Optional custom timeout in milliseconds
   */
  create(sessionId, context, page, metadata = {}, customTimeout = null) {
    const timeout = customTimeout || this.sessionTimeout;
    const session = {
      sessionId,
      context,
      page,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + timeout,
      lastAccessed: Date.now()
    };

    this.sessions.set(sessionId, session);
    console.log(`✅ Session created: ${sessionId} (expires in ${timeout / 1000}s)`);
    
    return session;
  }

  /**
   * Alias for create() for compatibility
   */
  createSession(sessionId, context, page, metadata = {}) {
    return this.create(sessionId, context, page, metadata);
  }

  /**
   * Alias for get() for compatibility
   */
  getSession(sessionId) {
    return this.get(sessionId);
  }

  /**
   * Update session metadata
   */
  updateSession(sessionId, metadata) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      console.log(`📝 Session metadata updated: ${sessionId}`);
    }
  }

  /**
   * Get an existing session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session object or null if not found/expired
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      const allSessionIds = Array.from(this.sessions.keys());
      console.log(`⚠️ Session not found: ${sessionId}`);
      console.log(`📋 Active sessions: ${allSessionIds.length > 0 ? allSessionIds.join(', ') : 'none'}`);
      return null;
    }

    // Check expiration
    const now = Date.now();
    const timeRemaining = session.expiresAt - now;
    
    if (timeRemaining <= 0) {
      console.log(`⏰ Session expired: ${sessionId} (expired ${Math.abs(Math.round(timeRemaining / 1000))}s ago)`);
      this.cleanup(sessionId);
      return null;
    }

    // Update last accessed time
    session.lastAccessed = now;
    console.log(`✅ Session retrieved: ${sessionId} (expires in ${Math.round(timeRemaining / 1000)}s)`);
    return session;
  }

  /**
   * Extend session expiration
   * @param {string} sessionId - Session identifier
   * @param {number} additionalTime - Additional time in milliseconds
   */
  extend(sessionId, additionalTime = null) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const oldExpiry = session.expiresAt;
      session.expiresAt = Date.now() + (additionalTime || this.sessionTimeout);
      const timeAdded = Math.round((session.expiresAt - oldExpiry) / 1000);
      console.log(`⏱️ Session extended: ${sessionId} (added ${timeAdded}s, now expires in ${Math.round((session.expiresAt - Date.now()) / 1000)}s)`);
    } else {
      console.warn(`⚠️ Cannot extend session ${sessionId} - session not found`);
    }
  }

  /**
   * Check if session exists and is valid
   * @param {string} sessionId - Session identifier
   * @returns {boolean}
   */
  has(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    if (Date.now() > session.expiresAt) {
      this.cleanup(sessionId);
      return false;
    }
    
    return true;
  }

  /**
   * Cleanup a specific session
   * @param {string} sessionId - Session identifier
   */
  async cleanup(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Import browserPool to release context
      const { browserPool } = await import('./browserPool.js');
      
      // Release context back to pool
      if (session.context) {
        await browserPool.releaseContext(session.context);
      }
      
      this.sessions.delete(sessionId);
      console.log(`🧹 Session cleaned up: ${sessionId}`);
      
    } catch (error) {
      console.error(`❌ Error cleaning up session ${sessionId}:`, error.message);
      // Still delete from map
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Start automatic cleanup of expired sessions
   * @private
   */
  startCleanup() {
    // Run cleanup every 5 minutes to avoid premature cleanup
    this.cleanupInterval = setInterval(() => {
      this._runCleanup();
    }, 5 * 60 * 1000); // 5 minutes

    console.log('🧹 Session cleanup scheduler started (runs every 5 minutes)');
  }

  /**
   * Run cleanup of expired sessions
   * @private
   */
  async _runCleanup() {
    const now = Date.now();
    const expired = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        expired.push(sessionId);
      }
    }

    if (expired.length > 0) {
      console.log(`🧹 Cleaning up ${expired.length} expired sessions...`);
      
      for (const sessionId of expired) {
        await this.cleanup(sessionId);
      }
    }
  }

  /**
   * Get all active sessions
   * @returns {Array} Array of session info
   */
  getActiveSessions() {
    const now = Date.now();
    const sessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now <= session.expiresAt) {
        sessions.push({
          sessionId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastAccessed: session.lastAccessed,
          timeRemaining: session.expiresAt - now,
          metadata: session.metadata
        });
      }
    }

    return sessions;
  }

  /**
   * Get all sessions (including expired, for admin monitoring)
   * @returns {Array} Array of all session info
   */
  getAllSessions() {
    const now = Date.now();
    const sessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      sessions.push({
        sessionId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastAccessed: session.lastAccessed,
        timeRemaining: Math.max(0, session.expiresAt - now),
        expired: now > session.expiresAt,
        metadata: session.metadata
      });
    }

    return sessions;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const session of this.sessions.values()) {
      if (now <= session.expiresAt) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      total: this.sessions.size,
      active,
      expired
    };
  }

  /**
   * Get age of oldest active session in seconds
   */
  getOldestSessionAge() {
    const now = Date.now();
    let oldest = 0;

    for (const session of this.sessions.values()) {
      if (now <= session.expiresAt) {
        const age = Math.floor((now - session.createdAt) / 1000);
        if (age > oldest) {
          oldest = age;
        }
      }
    }

    return oldest > 0 ? `${oldest}s` : null;
  }

  /**
   * Cleanup all sessions and stop scheduler
   */
  async shutdown() {
    console.log('🛑 Shutting down session manager...');
    
    // Stop cleanup scheduler
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cleanup all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.cleanup(sessionId);
    }

    console.log('✅ Session manager shutdown complete');
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Graceful shutdown
process.on('SIGTERM', () => sessionManager.shutdown());
process.on('SIGINT', () => sessionManager.shutdown());
