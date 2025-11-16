import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function testPopupLoad() {
    try {
        // Test 1: Load without authentication
        console.log('📥 Test 1: Loading popup settings (no auth)...');
        const publicRes = await fetch(`${API_BASE}/settings/popup`);
        
        if (!publicRes.ok) {
            throw new Error(`Public load failed: ${publicRes.status}`);
        }

        const publicData = await publicRes.json();
        console.log('✅ Public load successful:');
        console.log('   Status:', publicData.status);
        console.log('   Category:', publicData.category);
        console.log('   Enabled:', publicData.settings?.enabled);
        console.log('   Title:', publicData.settings?.title);
        console.log('');

        // Test 2: Load with authentication
        console.log('📥 Test 2: Loading popup settings (with auth)...');
        
        // Login first
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emailOrPhone: 'admin@test.com',
                password: 'admin123'
            })
        });

        if (!loginRes.ok) {
            throw new Error('Login failed');
        }

        const { token } = await loginRes.json();
        
        // Load settings with auth
        const authRes = await fetch(`${API_BASE}/settings/popup`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!authRes.ok) {
            const errorText = await authRes.text();
            throw new Error(`Authenticated load failed: ${authRes.status} - ${errorText}`);
        }

        const authData = await authRes.json();
        console.log('✅ Authenticated load successful:');
        console.log('   Status:', authData.status);
        console.log('   Category:', authData.category);
        console.log('   Enabled:', authData.settings?.enabled);
        console.log('   Title:', authData.settings?.title);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testPopupLoad();
