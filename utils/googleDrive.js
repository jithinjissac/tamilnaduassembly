import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Drive API with OAuth2
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let driveClient = null;
let oauth2Client = null;

// Rate limiting tracking
let uploadCount = 0;
let uploadResetTime = Date.now();
const MAX_UPLOADS_PER_MINUTE = 50; // Google Drive allows ~1000 requests per 100 seconds

// Initialize Google Drive client with OAuth2
async function getDriveClient() {
    if (driveClient) return driveClient;

    try {
        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
        
        if (!clientId || !clientSecret || !refreshToken) {
            console.error('❌ Missing OAuth2 credentials. Need: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN');
            return null;
        }
        
        console.log('🔑 Initializing Google Drive with OAuth2...');
        
        // Create OAuth2 client
        // Note: redirect URI is only needed for initial token generation, not for API calls with refresh token
        oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            'http://localhost:3000/oauth2callback' // Not used after token is obtained
        );
        
        // Set refresh token
        oauth2Client.setCredentials({
            refresh_token: refreshToken
        });
        
        console.log('✅ OAuth2 client configured');

        driveClient = google.drive({ version: 'v3', auth: oauth2Client });
        console.log('✅ Google Drive client initialized');
        return driveClient;
    } catch (error) {
        console.error('❌ Failed to initialize Google Drive client:', error.message);
        console.error('Full error:', error);
        return null;
    }
}

/**
 * Upload PDF to Google Drive and return shareable link
 * @param {string} filePath - Local path to the PDF file
 * @param {string} orderId - Order ID for naming
 * @returns {Promise<string|null>} - Shareable Google Drive link or null if failed
 */
export async function uploadToGoogleDrive(filePath, orderId) {
    try {
        const drive = await getDriveClient();
        if (!drive) {
            console.error('❌ Google Drive client not available');
            return null;
        }

        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            return null;
        }

        // Rate limiting check
        const now = Date.now();
        if (now - uploadResetTime > 60000) {
            // Reset counter every minute
            uploadCount = 0;
            uploadResetTime = now;
        }
        
        if (uploadCount >= MAX_UPLOADS_PER_MINUTE) {
            console.warn(`⚠️ Rate limit reached. Waiting before upload...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            uploadCount = 0;
            uploadResetTime = Date.now();
        }
        uploadCount++;

        const fileName = `${orderId}-voter-slips.pdf`;
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        console.log(`📤 Uploading to Google Drive: ${fileName}`);

        // Check if file already exists to avoid duplicates
        const existingFiles = await drive.files.list({
            q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, webContentLink, webViewLink)',
            spaces: 'drive'
        });

        if (existingFiles.data.files && existingFiles.data.files.length > 0) {
            // File already exists - return existing link instead of uploading duplicate
            const existingFile = existingFiles.data.files[0];
            const shareableLink = existingFile.webContentLink || existingFile.webViewLink;
            console.log(`✅ File already exists on Google Drive: ${shareableLink}`);
            return shareableLink;
        }

        const fileMetadata = {
            name: fileName,
            parents: folderId ? [folderId] : []
        };

        const media = {
            mimeType: 'application/pdf',
            body: fs.createReadStream(filePath)
        };

        // Upload new file
        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        const fileId = response.data.id;

        // Make file publicly accessible
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Get shareable link
        const file = await drive.files.get({
            fileId: fileId,
            fields: 'webViewLink, webContentLink'
        });

        const shareableLink = file.data.webContentLink || file.data.webViewLink;
        console.log(`✅ Uploaded to Google Drive: ${shareableLink}`);

        return shareableLink;
    } catch (error) {
        console.error('❌ Google Drive upload failed:', error.message);
        return null;
    }
}

/**
 * Delete file from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteFromGoogleDrive(fileId) {
    try {
        const drive = await getDriveClient();
        if (!drive) return false;

        await drive.files.delete({ fileId });
        console.log(`✅ Deleted from Google Drive: ${fileId}`);
        return true;
    } catch (error) {
        console.error('❌ Google Drive delete failed:', error.message);
        return false;
    }
}

/**
 * Check if Google Drive is configured
 * @returns {boolean}
 */
export function isGoogleDriveConfigured() {
    const hasClientId = !!process.env.GOOGLE_DRIVE_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const hasRefreshToken = !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const hasFolder = !!process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!hasClientId) console.warn('⚠️ GOOGLE_DRIVE_CLIENT_ID not set');
    if (!hasClientSecret) console.warn('⚠️ GOOGLE_DRIVE_CLIENT_SECRET not set');
    if (!hasRefreshToken) console.warn('⚠️ GOOGLE_DRIVE_REFRESH_TOKEN not set');
    if (!hasFolder) console.warn('⚠️ GOOGLE_DRIVE_FOLDER_ID not set');
    
    return hasClientId && hasClientSecret && hasRefreshToken && hasFolder;
}

/**
 * Test Google Drive connection
 * @returns {Promise<boolean>}
 */
export async function testGoogleDriveConnection() {
    try {
        console.log('🔍 Testing Google Drive connection...');
        
        if (!isGoogleDriveConfigured()) {
            console.error('❌ Google Drive not configured');
            return false;
        }
        
        const drive = await getDriveClient();
        if (!drive) {
            console.error('❌ Failed to get Drive client');
            return false;
        }
        
        // Try to access the folder
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const folder = await drive.files.get({
            fileId: folderId,
            fields: 'id, name, mimeType'
        });
        
        console.log(`✅ Google Drive connection successful! Folder: "${folder.data.name}"`);
        return true;
    } catch (error) {
        console.error('❌ Google Drive connection test failed:', error.message);
        if (error.code === 404) {
            console.error('   Folder not found or service account does not have access');
        } else if (error.code === 401 || error.code === 403) {
            console.error('   Authentication failed - check credentials');
        }
        return false;
    }
}
