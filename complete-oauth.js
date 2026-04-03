import 'dotenv/config';
import { google } from 'googleapis';

async function getRefreshToken() {
  const oauth2Client = new google.auth.OAuth2(
    '976853208588-5gpd1skbghef61gqsk7gv1jv3t3mcldu.apps.googleusercontent.com',
    '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',
    'http://localhost:3000/oauth2callback'
  );

  // Extract the code from your redirect URL
  const code = '4/0Ab32j93o3Pc1GrCB6QUSjtIGW1nWmNy0CCscueeJJNxkwM45L4WDnm5SsfWOvd2yP00HPQ';

  try {
    console.log('🔄 Exchanging authorization code for tokens...\n');
    
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('📦 All tokens received:');
    console.log(JSON.stringify(tokens, null, 2));
    console.log('\n');
    
    if (tokens.refresh_token) {
      console.log('✅ Success! Here is your refresh token:\n');
      console.log('─────────────────────────────────────────────────────────────');
      console.log('GOOGLE_DRIVE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('─────────────────────────────────────────────────────────────\n');
      console.log('📝 Copy the line above and add it to your .env file\n');
    } else {
      console.log('⚠️  No refresh token received!');
      console.log('This usually means you\'ve already authorized this app before.\n');
      console.log('To get a refresh token, you need to:');
      console.log('1. Go to: https://myaccount.google.com/permissions');
      console.log('2. Remove "Voter Information Slips Uploader" app access');
      console.log('3. Run the setup script again\n');
    }
    
  } catch (error) {
    console.error('❌ Error getting tokens:', error.message);
    if (error.response) {
      console.error('Details:', error.response.data);
    }
  }
}

getRefreshToken();
