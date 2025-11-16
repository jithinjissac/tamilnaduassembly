import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';
import { generateSlipHTML } from './controllers/slipController.js';
import fs from 'fs';

dotenv.config();

async function test6SlipGeneration() {
    try {
        console.log('🔌 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database\n');
        
        // Find an order with 6 slips per page
        const order = await Order.findOne({
            'customization.slipsPerPage': 6
        }).lean();
        
        if (!order) {
            console.log('❌ No order found with 6 slips per page setting');
            return;
        }
        
        console.log(`📋 Testing order: ${order.orderId}`);
        console.log(`   Slips per page: ${order.customization.slipsPerPage}`);
        console.log(`   Total voters: ${order.voters.length}\n`);
        
        // Generate HTML for first 12 voters (should be 2 pages × 6 slips)
        console.log('🔄 Generating HTML for first 12 voters...');
        const html = await generateSlipHTML(order, 0, 12);
        
        // Count how many .voter-slip divs are in the HTML
        const slipMatches = html.match(/<div class="voter-slip">/g);
        const slipCount = slipMatches ? slipMatches.length : 0;
        
        // Count how many .page divs
        const pageMatches = html.match(/<div class="page">/g);
        const pageCount = pageMatches ? pageMatches.length : 0;
        
        console.log(`\n📊 HTML Analysis:`);
        console.log(`   Pages generated: ${pageCount}`);
        console.log(`   Slips generated: ${slipCount}`);
        console.log(`   Expected: 2 pages × 6 slips = 12 slips`);
        
        if (slipCount === 12) {
            console.log('   ✅ Correct! 6 slips per page working properly');
        } else if (slipCount === 10) {
            console.log('   ❌ ISSUE: Only generating 5 slips per page (2 pages × 5 = 10)');
        } else {
            console.log(`   ⚠️  Unexpected slip count: ${slipCount}`);
        }
        
        // Check the slipHeight in the CSS
        const slipHeightMatch = html.match(/\.voter-slip\s*{[^}]*height:\s*([^;]+);/);
        if (slipHeightMatch) {
            console.log(`\n🎨 CSS Analysis:`);
            console.log(`   Slip height: ${slipHeightMatch[1]}`);
            console.log(`   Expected: 43mm for 6 slips per page`);
        }
        
        // Check padding
        const paddingMatch = html.match(/\.page\s*{[^}]*padding:\s*([^;]+);/);
        if (paddingMatch) {
            console.log(`   Page padding: ${paddingMatch[1]}`);
        }
        
        // Check margin-bottom
        const marginMatch = html.match(/\.voter-slip\s*{[^}]*margin-bottom:\s*([^;]+);/);
        if (marginMatch) {
            console.log(`   Slip gap (margin-bottom): ${marginMatch[1]}`);
        }
        
        // Save HTML to file for inspection
        fs.writeFileSync('test-6-slip-output.html', html);
        console.log(`\n💾 HTML saved to test-6-slip-output.html for inspection`);
        
        // Check the loop logic by examining the slipsPerPage value used
        const slipsPerPageLog = html.match(/slips per page/i);
        console.log(`\n🔍 Checking slipsPerPage variable usage...`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

test6SlipGeneration();
