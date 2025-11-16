import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function testPopupSave() {
    try {
        // First, login to get token
        console.log('🔐 Logging in...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emailOrPhone: 'admin@test.com',
                password: 'admin123'
            })
        });

        if (!loginRes.ok) {
            const errorText = await loginRes.text();
            throw new Error(`Login failed: ${loginRes.status} - ${errorText}`);
        }

        const { token } = await loginRes.json();
        console.log('✅ Login successful\n');

        // Test saving popup settings
        console.log('💾 Saving popup settings...');
        const saveRes = await fetch(`${API_BASE}/settings/popup`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                enabled: true,
                title: 'Test Popup',
                content: '<h2>Hello World!</h2><p>This is a test popup.</p>',
                showOnce: false,
                delay: 1000
            })
        });

        if (!saveRes.ok) {
            const error = await saveRes.text();
            throw new Error(`Save failed: ${error}`);
        }

        const saveData = await saveRes.json();
        console.log('✅ Save successful:', saveData);
        console.log('');

        // Test loading popup settings
        console.log('📥 Loading popup settings...');
        const loadRes = await fetch(`${API_BASE}/settings/popup`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!loadRes.ok) {
            throw new Error('Load failed');
        }

        const loadData = await loadRes.json();
        console.log('✅ Load successful:');
        console.log('   Full response:', JSON.stringify(loadData, null, 2));
        console.log('   Enabled:', loadData.enabled || loadData.settings?.enabled);
        console.log('   Title:', loadData.title || loadData.settings?.title);
        const content = loadData.content || loadData.settings?.content || '';
        console.log('   Content:', content.substring(0, 50) + '...');
        console.log('   Show Once:', loadData.showOnce || loadData.settings?.showOnce);
        console.log('   Delay:', loadData.delay || loadData.settings?.delay);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testPopupSave();
