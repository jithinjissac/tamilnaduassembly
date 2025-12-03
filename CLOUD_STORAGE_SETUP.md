# Google Cloud Storage Setup for Captcha Images

## ✅ Your Bucket Configuration
- **Bucket Name**: `slipsdata`
- **Location**: `asia-south1` (Mumbai)
- **Storage Class**: Standard
- **Access Control**: Uniform
- **Public Access**: Enabled (required for captcha images)

## 🔧 Implementation Summary

### What Changed
1. **Captcha Storage**: Screenshots now upload to Google Cloud Storage instead of local filesystem
2. **Automatic Cleanup**: Files auto-delete after 5 minutes
3. **Production Ready**: Works on Cloud Run, Railway, and any cloud platform
4. **Fallback Mode**: Uses local storage in development (`NODE_ENV !== 'production'`)

### How It Works
```javascript
// captchaController.js automatically:
1. Takes captcha screenshot to buffer
2. Uploads to GCS bucket: slipsdata/captcha-cache/captcha-{sessionId}.png
3. Makes file publicly readable
4. Returns public URL: https://storage.googleapis.com/slipsdata/captcha-cache/captcha-{sessionId}.png
5. Schedules deletion after 5 minutes
```

## 🚀 Deployment Steps

### For Cloud Run (Recommended)
Cloud Run automatically authenticates with Google Cloud Storage using service account.

**No additional configuration needed!** Just set environment variables:
```bash
USE_CLOUD_STORAGE=true
GCS_BUCKET_NAME=slipsdata
NODE_ENV=production
```

### For Railway/Other Platforms
You need to provide service account credentials.

#### Step 1: Create Service Account
```bash
# In Google Cloud Console or Cloud Shell:
gcloud iam service-accounts create voter-slip-app \
    --display-name="Voter Slip Application"

# Grant storage access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:voter-slip-app@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
```

#### Step 2: Generate Key
```bash
gcloud iam service-accounts keys create service-account-key.json \
    --iam-account=voter-slip-app@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Step 3: Configure Railway
In Railway dashboard, add the service account key as environment variable:

**Option A: Base64 Encoded (Recommended)**
```bash
# Encode key file to base64
base64 service-account-key.json

# Add to Railway as environment variable:
GCS_SERVICE_ACCOUNT_BASE64={base64_string_here}
```

Then update `captchaController.js` to decode:
```javascript
if (process.env.GCS_SERVICE_ACCOUNT_BASE64) {
  const credentials = JSON.parse(
    Buffer.from(process.env.GCS_SERVICE_ACCOUNT_BASE64, 'base64').toString()
  );
  const storage = new Storage({ credentials });
}
```

**Option B: File Path (Less secure)**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/app/service-account-key.json
```
Upload key file to your deployment.

## 📋 Environment Variables

### Required for Production
```bash
USE_CLOUD_STORAGE=true          # Enable cloud storage
GCS_BUCKET_NAME=slipsdata       # Your bucket name
NODE_ENV=production             # Triggers cloud mode
```

### Optional for Railway
```bash
# Only if not using Cloud Run:
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
# OR
GCS_SERVICE_ACCOUNT_BASE64=base64_encoded_key
```

## 🔒 Security Best Practices

### 1. Bucket Permissions
Your bucket is currently configured correctly:
- ✅ Uniform access control
- ✅ Files made public individually (not whole bucket)
- ✅ No org policy restrictions

### 2. File Lifecycle
Files are automatically:
- Made public only when created
- Deleted after 5 minutes
- Never persisted long-term

### 3. Service Account Permissions
Grant minimal permissions:
- `storage.objects.create` - Upload captchas
- `storage.objects.delete` - Clean up files
- `storage.objects.setIamPolicy` - Make public

## 🧪 Testing

### Test Locally (Development Mode)
```bash
# Uses local filesystem (public/captcha-cache/)
npm run dev
```

### Test with Cloud Storage Locally
```bash
# Set environment variables
export USE_CLOUD_STORAGE=true
export GCS_BUCKET_NAME=slipsdata
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

npm run dev
```

### Verify Upload
```bash
# Check if files are being created
gsutil ls gs://slipsdata/captcha-cache/

# Monitor in real-time
watch -n 1 'gsutil ls gs://slipsdata/captcha-cache/ | wc -l'
```

## 📊 Monitoring

### Cloud Console
1. Go to [Cloud Storage Browser](https://console.cloud.google.com/storage/browser/slipsdata)
2. Navigate to `captcha-cache/` folder
3. Files should appear briefly and auto-delete after 5 min

### Application Logs
Look for these log messages:
```
[CAPTCHA] ☁️ Uploading to Cloud Storage: captcha-1234567890.png
[CAPTCHA] ✅ Uploaded to Cloud Storage (7594 bytes)
[CAPTCHA] 🔗 Public URL: https://storage.googleapis.com/slipsdata/captcha-cache/captcha-1234567890.png
[CAPTCHA] ☁️🗑️ Scheduled cloud cleanup: captcha-cache/captcha-1234567890.png deleted
```

## 🐛 Troubleshooting

### Error: "Could not load the default credentials"
**Solution**: Set `GOOGLE_APPLICATION_CREDENTIALS` or use Cloud Run

### Error: "Permission denied"
**Solution**: Verify service account has `storage.objectAdmin` role

### Error: "Bucket not found"
**Solution**: Check `GCS_BUCKET_NAME` matches your bucket name exactly

### Images not loading (404)
**Solution**: 
1. Check file was made public: `await file.makePublic()`
2. Verify URL format: `https://storage.googleapis.com/slipsdata/captcha-cache/captcha-XXX.png`
3. Check bucket CORS settings if needed

## 💰 Cost Estimation

Based on your usage:
- **Storage**: ~1000 captchas/day × 8KB × 5min retention = **Negligible**
- **Operations**: 
  - Write: 1000/day = ₹0.04/month
  - Read: 5000/day = ₹0.03/month
  - Delete: 1000/day = ₹0.004/month
- **Network**: Mumbai region (same as Cloud Run) = **Free**

**Total**: ~₹0.10/month (practically free)

## ✅ Deployment Checklist

- [x] Bucket created: `slipsdata`
- [x] Location set to Mumbai: `asia-south1`
- [x] Code updated to use Cloud Storage
- [ ] Service account created (if using Railway)
- [ ] Environment variables configured
- [ ] Test captcha generation works
- [ ] Verify files auto-delete after 5 minutes
- [ ] Monitor logs for any errors

## 🎯 Next Steps

1. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy voter-slip-api \
     --source . \
     --region asia-south1 \
     --set-env-vars USE_CLOUD_STORAGE=true,GCS_BUCKET_NAME=slipsdata,NODE_ENV=production
   ```

2. **Commit Changes**:
   ```bash
   git add .
   git commit -m "Add Google Cloud Storage for captcha images"
   git push
   ```

3. **Test Production**: Generate a slip and verify captcha loads from GCS URL

---

**Status**: ✅ Implementation Complete - Ready for Deployment
