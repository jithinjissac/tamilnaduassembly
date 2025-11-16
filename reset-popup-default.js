import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function resetPopup() {
    try {
        // Login
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

        // Reset popup to default
        console.log('🔄 Resetting popup to default...');
        const defaultContent = '<div style="text-align: center; padding: 20px;"><p style="font-size: 18px; color: #333; line-height: 1.8;">Welcome to our service! We\'re excited to have you here.</p><button style="background: linear-gradient(135deg, #b8860b 0%, #ffd700 100%); color: white; border: none; padding: 12px 30px; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px;">Get Started</button></div>';
        
        const resetRes = await fetch(`${API_BASE}/settings/popup`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                enabled: false,
                title: 'Welcome!',
                content: defaultContent,
                showOnce: false,
                delay: 1000
            })
        });

        if (!resetRes.ok) {
            const error = await resetRes.text();
            throw new Error(`Reset failed: ${error}`);
        }

        const result = await resetRes.json();
        console.log('✅ Popup reset to default successfully!');
        console.log('   Enabled:', result.settings.enabled);
        console.log('   Title:', result.settings.title);
        console.log('\n💡 Note: Popup is disabled. Enable it in the admin panel to show on index page.');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

resetPopup();
