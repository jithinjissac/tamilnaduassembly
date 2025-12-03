# Cloud Run Google Cloud Storage Setup for Captcha Storage (RECOMMENDED)

## Overview
This application uses **Google Cloud Storage (GCS)** for storing captcha images in production. This is the recommended approach for Cloud Run deployments as it:
- ✅ Persists across container restarts and deployments
- ✅ Works seamlessly with auto-scaling (multiple instances)
- ✅ No need for volume mounts
- ✅ Auto-cleanup with lifecycle rules
- ✅ Better performance and reliability
- ✅ Lower cost (~$0.023/GB/month vs $0.20/GB for volumes)

## Quick Setup

### 1. Create GCS Bucket (Already Done ✅)
You've already created bucket: **slipsdata** in **asia-south1 (Mumbai)**

### 2. Set Environment Variables in Cloud Run

```bash
USE_GCS=true
GCS_BUCKET_NAME=slipsdata
```

### 3. Grant Cloud Run Service Account Permissions

```bash
# Get your Cloud Run service account
gcloud run services describe YOUR_SERVICE_NAME --region=asia-south1 --format="value(spec.template.spec.serviceAccountName)"

# Grant storage permissions
gsutil iam ch serviceAccount:YOUR_SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com:roles/storage.objectAdmin gs://slipsdata
```

Or using Cloud Console:
1. Go to [GCS Bucket Permissions](https://console.cloud.google.com/storage/browser/slipsdata)
2. Click **Permissions** tab
3. Click **Grant Access**
4. Add your Cloud Run service account email
5. Role: **Storage Object Admin**

### 4. Deploy to Cloud Run

```bash
gcloud run deploy kerala-voter-slips \
  --image gcr.io/YOUR_PROJECT/kerala-app \
  --platform managed \
  --region asia-south1 \
  --set-env-vars USE_GCS=true,GCS_BUCKET_NAME=slipsdata
```

## How It Works

### Development (Local)
- **No environment variable needed**
- Uses `public/captcha-cache` directory
- Files stored locally

### Production (Cloud Run)
- **Set `CAPTCHA_VOLUME_PATH`** to mounted volume path
- Uses persistent volume for captcha storage
- Files persist across deployments and restarts
- Auto-cleanup after 5 minutes

## Code Changes Made

### 1. `controllers/captchaController.js`
```javascript
CAPTCHA_DIR: process.env.CAPTCHA_VOLUME_PATH || path.join(__dirname, '..', 'public', 'captcha-cache')
```

### 2. `server.js`
```javascript
// Directory creation
process.env.CAPTCHA_VOLUME_PATH || path.join(__dirname, 'public', 'captcha-cache')

// Static file serving
app.use('/captcha-cache', express.static(
  process.env.CAPTCHA_VOLUME_PATH || path.join(__dirname, 'public', 'captcha-cache')
))
```

## Verification

### Check if volume is working:
1. Deploy to Cloud Run with volume mounted
2. Access: `https://your-app.run.app/api/debug/captcha-status`
3. Response should show:
```json
{
  "success": true,
  "directory": "/mnt/captcha-storage",
  "exists": true,
  "writable": true,
  "fileCount": X,
  "platform": "linux"
}
```

### Troubleshooting

**Issue**: `directory: exists: false`
- **Fix**: Ensure volume is mounted correctly in Cloud Run configuration

**Issue**: `writable: false`
- **Fix**: Check volume permissions, ensure service account has write access

**Issue**: Files still disappearing
- **Fix**: Verify `CAPTCHA_VOLUME_PATH` environment variable is set correctly

**Issue**: 404 errors on captcha images
- **Fix**: 
  1. Check `/api/debug/captcha-status` to verify directory
  2. Ensure static route is serving from correct path
  3. Check Cloud Run logs for file creation

## Cleanup Strategy

Captcha files are automatically deleted after **5 minutes** to prevent storage bloat:
- Scheduled deletion runs for each captcha
- Files older than 5 minutes are removed
- No manual cleanup needed

## Alternative: Cloud Storage Bucket

If you prefer using Google Cloud Storage bucket instead of mounted volume:
1. Create a GCS bucket
2. Use Cloud Run volume with type `cloud-storage`
3. Mount bucket to `/mnt/captcha-storage`
4. Set `CAPTCHA_VOLUME_PATH=/mnt/captcha-storage`

Advantages:
- Better scalability across multiple instances
- Automatic redundancy
- Can use lifecycle rules for auto-cleanup
- No need for scheduled deletion in code

## Cost Consideration

**Mounted Volume**: ~$0.20/GB/month
**Cloud Storage**: ~$0.023/GB/month

For captcha images (temporary, auto-deleted after 5min), both options are very cheap.
