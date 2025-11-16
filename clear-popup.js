import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function clearPopup() {
    try {
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
            throw new Error('Login failed');
        }

        const { token } = await loginRes.json();
        console.log('✅ Login successful\n');

        console.log('🔄 Clearing popup content...');
        
        const clearRes = await fetch(`${API_BASE}/settings/popup`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                enabled: false,
                title: 'Announcement',
                content: '',
                showOnce: false,
                delay: 1000
            })
        });

        if (!clearRes.ok) {
            const error = await clearRes.text();
            throw new Error(`Clear failed: ${error}`);
        }

        const result = await clearRes.json();
        console.log('✅ Popup content cleared!');
        console.log('   Title:', result.settings.title);
        console.log('   Content:', result.settings.content === '' ? '(empty - ready for new content)' : result.settings.content);
        console.log('\n💡 Now open admin panel to design your popup from scratch.');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

clearPopup();
