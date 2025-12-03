import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Cloud Storage
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'slipsdata';
const USE_GCS = process.env.USE_GCS === 'true';

// Fallback local directory for development
const LOCAL_CAPTCHA_DIR = path.join(__dirname, '..', 'public', 'captcha-cache');

// Ensure local directory exists if not using GCS
if (!USE_GCS && !fs.existsSync(LOCAL_CAPTCHA_DIR)) {
  fs.mkdirSync(LOCAL_CAPTCHA_DIR, { recursive: true });
  console.log('✅ Local captcha directory created:', LOCAL_CAPTCHA_DIR);
}

/**
 * Save captcha screenshot to GCS or local storage
 * @param {Buffer} buffer - Screenshot buffer from Playwright
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<string>} - Public URL or local path
 */
export async function saveCaptcha(buffer, sessionId) {
  const filename = `captcha-${sessionId}.png`;
  
  if (USE_GCS) {
    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(`captcha/${filename}`);
      
      // Upload to GCS
      await file.save(buffer, {
        metadata: {
          contentType: 'image/png',
          cacheControl: 'no-store, no-cache, must-revalidate, max-age=0'
        },
        resumable: false
      });
      
      // Make file publicly readable (temporary, will auto-delete)
      await file.makePublic();
      
      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/captcha/${filename}`;
      
      console.log(`[STORAGE] ✅ Captcha uploaded to GCS: ${filename}`);
      console.log(`[STORAGE] 📁 Public URL: ${publicUrl}`);
      
      // Schedule deletion after 5 minutes
      scheduleGCSFileDeletion(filename, 5 * 60 * 1000);
      
      return publicUrl;
    } catch (error) {
      console.error('[STORAGE] ❌ GCS upload failed:', error.message);
      console.log('[STORAGE] 🔄 Falling back to local storage...');
      // Fall back to local storage
      return saveToLocal(buffer, sessionId);
    }
  } else {
    return saveToLocal(buffer, sessionId);
  }
}

/**
 * Save to local file system (development or fallback)
 */
async function saveToLocal(buffer, sessionId) {
  const filename = `captcha-${sessionId}.png`;
  const filePath = path.join(LOCAL_CAPTCHA_DIR, filename);
  
  fs.writeFileSync(filePath, buffer);
  
  // Wait to ensure file is written
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    throw new Error('Captcha file not created locally');
  }
  
  const stats = fs.statSync(filePath);
  console.log(`[STORAGE] ✅ Captcha saved locally: ${filename} (${stats.size} bytes)`);
  console.log(`[STORAGE] 📁 Local path: ${filePath}`);
  
  // Schedule local file deletion after 5 minutes
  scheduleLocalFileDeletion(filePath, 5 * 60 * 1000);
  
  // Return relative URL for serving via Express static
  return `/captcha-cache/${filename}`;
}

/**
 * Schedule GCS file deletion
 */
function scheduleGCSFileDeletion(filename, delayMs) {
  setTimeout(async () => {
    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(`captcha/${filename}`);
      
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`[STORAGE] 🗑️ GCS file deleted: ${filename}`);
      }
    } catch (error) {
      console.error(`[STORAGE] Error deleting GCS file ${filename}:`, error.message);
    }
  }, delayMs);
}

/**
 * Schedule local file deletion
 */
function scheduleLocalFileDeletion(filePath, delayMs) {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[STORAGE] 🗑️ Local file deleted: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(`[STORAGE] Error deleting local file:`, error.message);
    }
  }, delayMs);
}

/**
 * Delete captcha immediately (used in cleanup)
 */
export async function deleteCaptcha(sessionId) {
  const filename = `captcha-${sessionId}.png`;
  
  if (USE_GCS) {
    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(`captcha/${filename}`);
      
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`[STORAGE] 🗑️ GCS captcha deleted: ${filename}`);
      }
    } catch (error) {
      console.error('[STORAGE] Error deleting GCS captcha:', error.message);
    }
  } else {
    const filePath = path.join(LOCAL_CAPTCHA_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[STORAGE] 🗑️ Local captcha deleted: ${filename}`);
    }
  }
}

/**
 * Get storage info for debugging
 */
export function getStorageInfo() {
  return {
    mode: USE_GCS ? 'Google Cloud Storage' : 'Local File System',
    bucket: USE_GCS ? BUCKET_NAME : null,
    localDir: !USE_GCS ? LOCAL_CAPTCHA_DIR : null,
    enabled: true
  };
}
