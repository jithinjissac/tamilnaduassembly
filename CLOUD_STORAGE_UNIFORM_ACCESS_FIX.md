# Cloud Storage Uniform Bucket-Level Access Fix

## Problem
Your GCS bucket has **Uniform Bucket-Level Access** enabled, which disables legacy ACL methods like `makePublic()` or `public: true`.

Error: `Cannot insert legacy ACL for an object when uniform bucket-level access is enabled`

## Solution Applied

### Code Changes
✅ **Removed `public: true` from file upload** - This legacy ACL option is incompatible with Uniform Bucket-Level Access

### Required: Configure Bucket Permissions

You need to make your bucket publicly readable via IAM (one-time setup):

#### Option 1: Using Google Cloud Console (Recommended)

1. Go to [Google Cloud Storage Console](https://console.cloud.google.com/storage/)
2. Click on your bucket: `slipsdata`
3. Go to the **Permissions** tab
4. Click **Grant Access**
5. Add principal: `allUsers`
6. Select role: **Storage Object Viewer**
7. Click **Save**

#### Option 2: Using gcloud CLI

```bash
# Make entire bucket publicly readable
gsutil iam ch allUsers:objectViewer gs://slipsdata

# Or just the captcha-cache folder
gsutil iam ch allUsers:objectViewer gs://slipsdata/captcha-cache/*
```

#### Option 3: Using Node.js (Run Once)

```javascript
// run-once-make-bucket-public.js
import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const bucketName = 'slipsdata';

async function makeBucketPublic() {
  await storage.bucket(bucketName).makePublic();
  console.log(`Bucket ${bucketName} is now publicly readable`);
}

makeBucketPublic().catch(console.error);
```

Run: `node run-once-make-bucket-public.js`

## Alternative: Use Signed URLs (More Secure)

If you don't want the bucket to be fully public, you can generate signed URLs:

```javascript
// In captchaController.js
const [signedUrl] = await file.getSignedUrl({
  version: 'v4',
  action: 'read',
  expires: Date.now() + 10 * 60 * 1000, // 10 minutes
});

return {
  url: signedUrl,
  base64: `data:image/png;base64,${screenshotBase64}`
};
```

**Pros**: More secure, time-limited access
**Cons**: Slower (generates URL for each request), URLs expire

## Current Setup

- ✅ Code updated to work with Uniform Bucket-Level Access
- ⚠️ **Action Required**: Configure bucket IAM permissions (see above)
- ✅ Fallback to local storage if Cloud Storage fails

## Testing

After configuring permissions:

1. Start server: `npm start`
2. Load captcha page
3. Check logs for: `[CAPTCHA] ✅ Uploaded to Cloud Storage`
4. Verify captcha image loads in browser
5. Check URL: `https://storage.googleapis.com/slipsdata/captcha-cache/captcha-*.png`

## Verification

Test if your bucket is public:
```bash
curl -I https://storage.googleapis.com/slipsdata/captcha-cache/test.png
```

Should return `200 OK` if public, `403 Forbidden` if not configured yet.
