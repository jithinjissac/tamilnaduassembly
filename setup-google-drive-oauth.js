import { google } from 'googleapis';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

console.log('\n🔐 Google Drive OAuth2 Setup Helper\n');
console.log('This script will help you get the OAuth2 tokens for Google Drive.\n');

// Step 1: Get Client ID and Secret
console.log('📋 Step 1: Get OAuth2 Credentials\n');
console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
console.log('2. Click "Create Credentials" → "OAuth 2.0 Client ID"');
console.log('3. Application type: "Web application"');
console.log('4. Name it: "Voter Slips Uploader"');
console.log('5. Authorized redirect URIs: Add "http://localhost:3000/oauth2callback"');
console.log('6. Click "Create"\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function main() {
    const clientId = await question('Enter your Client ID: ');
    const clientSecret = await question('Enter your Client Secret: ');
    
    console.log('\n📋 Step 2: Authorize Access\n');
    
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        REDIRECT_URI
    );
    
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    
    console.log('Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n');
    console.log('After authorizing, you will be redirected to a page that might show an error.');
    console.log('Copy the FULL URL from the browser address bar.\n');
    console.log('Example: http://localhost:3000/oauth2callback?code=4/0Adeu5BW...');
    console.log('\n');
    
    const redirectUrl = await question('Paste the full redirect URL here: ');
    
    // Extract code from URL
    const urlParams = new URL(redirectUrl).searchParams;
    const code = urlParams.get('code');
    
    if (!code) {
        console.error('❌ No authorization code found in URL');
        rl.close();
        return;
    }
    
    console.log('\n🔄 Exchanging code for tokens...\n');
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        
        console.log('✅ Success! Add these to your .env file:\n');
        console.log('GOOGLE_DRIVE_CLIENT_ID=' + clientId);
        console.log('GOOGLE_DRIVE_CLIENT_SECRET=' + clientSecret);
        console.log('GOOGLE_DRIVE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n');
        
        console.log('📝 Complete .env configuration:\n');
        console.log('# Google Drive OAuth2 Configuration');
        console.log('GOOGLE_DRIVE_CLIENT_ID=' + clientId);
        console.log('GOOGLE_DRIVE_CLIENT_SECRET=' + clientSecret);
        console.log('GOOGLE_DRIVE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('GOOGLE_DRIVE_FOLDER_ID=<your-folder-id>');
        console.log('\n');
        
        console.log('🎉 Setup complete! Update your .env file and restart the server.');
        
    } catch (error) {
        console.error('❌ Failed to get tokens:', error.message);
    }
    
    rl.close();
}

main();
