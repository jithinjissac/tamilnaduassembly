import dotenv from 'dotenv';
import { testGoogleDriveConnection } from './utils/googleDrive.js';

dotenv.config();

console.log('\n🔍 Testing Google Drive Configuration...\n');

console.log('Environment Variables Check:');
console.log('✓ GOOGLE_DRIVE_CLIENT_EMAIL:', process.env.GOOGLE_DRIVE_CLIENT_EMAIL ? 'Set' : '❌ Missing');
console.log('✓ GOOGLE_DRIVE_PRIVATE_KEY:', process.env.GOOGLE_DRIVE_PRIVATE_KEY ? `Set (${process.env.GOOGLE_DRIVE_PRIVATE_KEY.length} chars)` : '❌ Missing');
console.log('✓ GOOGLE_DRIVE_FOLDER_ID:', process.env.GOOGLE_DRIVE_FOLDER_ID ? 'Set' : '❌ Missing');

console.log('\n📋 Private Key Preview (first 100 chars):');
console.log(process.env.GOOGLE_DRIVE_PRIVATE_KEY?.substring(0, 100) + '...');

console.log('\n🧪 Testing connection to Google Drive...\n');

testGoogleDriveConnection()
    .then((success) => {
        if (success) {
            console.log('\n✅ All tests passed! Google Drive is configured correctly.');
            process.exit(0);
        } else {
            console.log('\n❌ Tests failed. Check the errors above.');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('\n❌ Unexpected error:', error);
        process.exit(1);
    });
