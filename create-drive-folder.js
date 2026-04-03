import 'dotenv/config';
import { google } from 'googleapis';

async function createFolder() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('📁 Creating "Voter Information Slips PDFs" folder in your Google Drive...\n');

    const fileMetadata = {
      name: 'Voter Information Slips PDFs',
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name, webViewLink'
    });

    console.log('✅ Folder created successfully!\n');
    console.log('Folder Details:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Name:', folder.data.name);
    console.log('ID:', folder.data.id);
    console.log('Link:', folder.data.webViewLink);
    console.log('─────────────────────────────────────────────────────────────\n');
    console.log('📝 Add this to your .env file:');
    console.log('GOOGLE_DRIVE_FOLDER_ID=' + folder.data.id);
    console.log('\n');

  } catch (error) {
    console.error('❌ Error creating folder:', error.message);
  }
}

createFolder();
