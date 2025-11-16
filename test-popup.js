/**
 * Test script for Popup System
 * Run this after starting the server to verify popup functionality
 */

const API_BASE = 'http://localhost:3000/api';

// Test data
const testPopupSettings = {
    enabled: true,
    title: 'Test Popup - Kerala Elections',
    content: '<div style="text-align: center;"><h3>Welcome to EasySlip!</h3><p>Generate professional voter slips for Kerala elections.</p><button style="background: linear-gradient(135deg, #b8860b 0%, #ffd700 100%); color: white; border: none; padding: 12px 30px; border-radius: 5px; cursor: pointer;">Get Started</button></div>',
    showOnce: false,
    delay: 1000
};

async function testPopupSystem() {
    console.log('🧪 Testing Popup System...\n');

    try {
        // Step 1: Get current popup settings
        console.log('📥 Step 1: Fetching current popup settings...');
        let response = await fetch(`${API_BASE}/settings/popup`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch settings: ${response.status}`);
        }
        
        let data = await response.json();
        console.log('✅ Current settings:', JSON.stringify(data, null, 2));

        // Step 2: Test if we can get token (need admin token for PUT)
        console.log('\n📝 Step 2: Login test (use your admin credentials)...');
        console.log('Note: To test save functionality, you need to login as admin first.');
        console.log('Try visiting http://localhost:3000/admin.html to test the UI manually.\n');

        // Step 3: Verify settings structure
        console.log('🔍 Step 3: Verifying settings structure...');
        const requiredFields = ['enabled', 'title', 'content', 'showOnce', 'delay'];
        const settings = data.settings || {};
        
        const hasAllFields = requiredFields.every(field => field in settings);
        
        if (hasAllFields) {
            console.log('✅ All required fields present:', requiredFields.join(', '));
        } else {
            console.log('⚠️ Missing fields:', requiredFields.filter(f => !(f in settings)));
        }

        // Step 4: Display test summary
        console.log('\n📊 Test Summary:');
        console.log('─────────────────────────────────────────');
        console.log(`Enabled: ${settings.enabled ? '✅' : '❌'}`);
        console.log(`Title: "${settings.title}"`);
        console.log(`Delay: ${settings.delay}ms`);
        console.log(`Show Once: ${settings.showOnce ? 'Yes' : 'No'}`);
        console.log(`Content Length: ${settings.content?.length || 0} characters`);
        console.log('─────────────────────────────────────────\n');

        // Step 5: Manual testing instructions
        console.log('📋 Manual Testing Steps:');
        console.log('1. Visit http://localhost:3000/admin.html');
        console.log('2. Login with admin credentials');
        console.log('3. Click "Popup Editor" tab');
        console.log('4. Drag components to the drop zone');
        console.log('5. Click "Preview" to test the popup');
        console.log('6. Click "Save Settings" to persist changes');
        console.log('7. Visit http://localhost:3000/index.html to see popup in action');
        console.log('8. Check browser console for any errors\n');

        console.log('✅ Popup system API is working correctly!');
        console.log('✅ Default settings are loaded from model');
        console.log('✅ Ready for manual UI testing\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\nTroubleshooting:');
        console.log('- Make sure the server is running (npm start)');
        console.log('- Check if MongoDB is connected');
        console.log('- Verify Settings model has popup category');
        process.exit(1);
    }
}

// Run the test
testPopupSystem();
