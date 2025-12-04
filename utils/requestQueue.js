/**
 * Request Queue Manager
 * Limits concurrent operations to prevent server overload
 * - Queues excess requests
 * - Prevents resource exhaustion
 * - Provides graceful degradation under load
 */
class RequestQueue {
  constructor(name, maxConcurrent = 10) {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
    this.totalProcessed = 0;
    this.totalQueued = 0;
    
    console.log(`📊 Request Queue '${name}' initialized (max concurrent: ${maxConcurrent})`);
  }

  /**
   * Add a request to the queue
   * @param {Function} fn - Async function to execute
   * @param {number} priority - Priority level (higher = more important)
   * @returns {Promise} Result of the function
   */
  async add(fn, priority = 0) {
    // If under limit, execute immediately
    if (this.running < this.maxConcurrent) {
      return await this._execute(fn);
    }

    // Otherwise, queue it
    this.totalQueued++;
    console.log(`⏳ [${this.name}] Request queued (${this.queue.length + 1} in queue, ${this.running} running)`);

    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority, queuedAt: Date.now() });
      // Sort by priority (higher first)
      this.queue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Execute a request
   * @private
   */
  async _execute(fn) {
    this.running++;
    this.totalProcessed++;
    
    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
      this._processNext();
    }
  }

  /**
   * Process next request in queue
   * @private
   */
  _processNext() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { fn, resolve, reject, queuedAt } = this.queue.shift();
      
      const waitTime = Date.now() - queuedAt;
      if (waitTime > 1000) {
        console.log(`⏱️ [${this.name}] Request waited ${(waitTime / 1000).toFixed(1)}s in queue`);
      }

      this._execute(fn)
        .then(resolve)
        .catch(reject);
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      name: this.name,
      maxConcurrent: this.maxConcurrent,
      running: this.running,
      queued: this.queue.length,
      totalProcessed: this.totalProcessed,
      totalQueued: this.totalQueued,
      utilizationPercent: (this.running / this.maxConcurrent * 100).toFixed(1)
    };
  }

  /**
   * Clear the queue (useful for shutdown)
   */
  clear() {
    const cleared = this.queue.length;
    
    // Reject all queued requests
    for (const { reject } of this.queue) {
      reject(new Error('Queue cleared during shutdown'));
    }
    
    this.queue = [];
    console.log(`🧹 [${this.name}] Queue cleared (${cleared} requests cancelled)`);
    
    return cleared;
  }

  /**
   * Wait for all running requests to complete
   */
  async drain() {
    console.log(`⏳ [${this.name}] Draining queue (${this.running} running, ${this.queue.length} queued)...`);
    
    // Wait until no requests are running
    while (this.running > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ [${this.name}] Queue drained`);
  }
}

// Create queue instances for different operations
// Optimized for 32 vCPU / 32 GB RAM server
// Increased to handle 100+ concurrent users
export const captchaQueue = new RequestQueue('Captcha', 120);
export const pdfQueue = new RequestQueue('PDF', 30);
export const slipQueue = new RequestQueue('Slip', 50);

// Export stats endpoint helper
export function getAllQueueStats() {
  return {
    captcha: captchaQueue.getStats(),
    pdf: pdfQueue.getStats(),
    slip: slipQueue.getStats()
  };
}

// Graceful shutdown
async function shutdown() {
  console.log('🛑 Shutting down request queues...');
  
  // Clear all queues
  captchaQueue.clear();
  pdfQueue.clear();
  slipQueue.clear();
  
  // Wait for running requests to complete (max 10s)
  const drainPromises = [
    captchaQueue.drain(),
    pdfQueue.drain(),
    slipQueue.drain()
  ];
  
  await Promise.race([
    Promise.all(drainPromises),
    new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout
  ]);
  
  console.log('✅ Request queues shutdown complete');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
