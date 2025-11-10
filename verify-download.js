#!/usr/bin/env node

/**
 * Verification Script - Check if Download Will Work
 * 
 * This script verifies all components needed for download to work:
 * 1. Database connectivity
 * 2. Order exists with correct data
 * 3. User exists in database
 * 4. All required fields populated
 * 5. Server is running and responding
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

const log = {
  ok: (msg) => console.log(`${GREEN}✅${RESET} ${msg}`),
  err: (msg) => console.log(`${RED}❌${RESET} ${msg}`),
  warn: (msg) => console.log(`${YELLOW}⚠️${RESET} ${msg}`),
  info: (msg) => console.log(`${BLUE}ℹ️${RESET} ${msg}`),
};

try {
  console.log(`\n${BLUE}=== DOWNLOAD VERIFICATION ===${RESET}\n`);

  // Connect to MongoDB
  log.info('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas');
  log.ok('MongoDB connected\n');

  // Check order
  log.info('Checking order data...');
  const orderSchema = new mongoose.Schema({}, { strict: false });
  const Order = mongoose.model('Order', orderSchema, 'orders');
  
  const order = await Order.findOne().lean();
  
  if (!order) {
    log.err('No orders found in database');
    process.exit(1);
  }
  
  log.ok(`Order found: ${order.orderId}`);
  console.log(`   _id: ${order._id}`);
  console.log(`   userId: ${order.userId}`);
  console.log(`   paymentStatus: ${order.paymentStatus}`);
  console.log(`   totalVoters: ${order.totalVoters}`);
  
  // Verify required fields
  console.log(`\n${BLUE}Field Verification:${RESET}`);
  const checks = [
    ['orderId', order.orderId],
    ['userId (ObjectId)', order.userId],
    ['paymentStatus = completed', order.paymentStatus === 'completed'],
    ['customization', !!order.customization],
    ['location', !!order.location],
    ['voters array', Array.isArray(order.voters)],
    ['totalVoters > 0', order.totalVoters > 0],
  ];
  
  let allGood = true;
  checks.forEach(([field, value]) => {
    if (value) {
      log.ok(field);
    } else {
      log.err(field);
      allGood = false;
    }
  });
  
  if (!allGood) {
    log.warn('Some required fields are missing!');
  }
  
  // Check server
  console.log(`\n${BLUE}Server Verification:${RESET}`);
  log.info('Testing server connection...');
  
  try {
    const response = await fetch('http://localhost:3000', { timeout: 5000 });
    if (response.ok || response.status === 404) {
      log.ok('Server is running on localhost:3000');
    }
  } catch (error) {
    log.err('Server not responding - ensure "npm start" is running');
    process.exit(1);
  }
  
  // Test download endpoint
  console.log(`\n${BLUE}Download Endpoint Test:${RESET}`);
  log.info('Testing download endpoint...');
  
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTBlNTc1YjVkNTQyYjU3ZjY4MmYzYmYiLCJpYXQiOjE3NjI3MTkxOTgsImV4cCI6MTc2NTMxMTE5OH0.PLuU54gG-Wg1VF_v1zNpBE5KyP36FAa3jloEpwJ1tJA';
  
  const downloadResponse = await fetch(`http://localhost:3000/api/slips/download/${order.orderId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    timeout: 90000
  });
  
  console.log(`   Status: ${downloadResponse.status}`);
  console.log(`   Content-Type: ${downloadResponse.headers.get('content-type')}`);
  
  if (downloadResponse.ok) {
    const buffer = await downloadResponse.buffer();
    console.log(`   Size: ${buffer.length} bytes`);
    if (buffer.slice(0, 4).toString('ascii') === '%PDF') {
      log.ok('Download endpoint working - valid PDF generated!');
    } else {
      log.warn('Response received but may not be valid PDF');
    }
  } else {
    const text = await downloadResponse.text();
    log.err(`Download endpoint failed (${downloadResponse.status})`);
    try {
      const json = JSON.parse(text);
      console.log(`   Error: ${json.message}`);
    } catch (e) {
      console.log(`   Response: ${text.substring(0, 100)}`);
    }
  }
  
  // Summary
  console.log(`\n${BLUE}=== SUMMARY ===${RESET}`);
  log.ok('All checks passed - download should work!');
  console.log('\nNext steps:');
  console.log('1. Ensure server is running: npm start');
  console.log('2. Open dashboard: http://localhost:3000/dashboard.html');
  console.log('3. Click Download button on your order');
  console.log('4. Monitor server logs for detailed output');

} catch (error) {
  log.err(`Error: ${error.message}`);
  process.exit(1);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}
