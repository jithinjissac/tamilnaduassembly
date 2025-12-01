# Symbol Storage Issue - 404 Errors

## Problem
Symbol images uploaded by users are returning 404 errors:
```
GET 404 https://easyslip.techiussolutions.in/symbols/symbol-1764598107837-826727082.png
GET 404 https://easyslip.techiussolutions.in/symbols/symbol-1764597853299-329960065.webp
GET 404 https://easyslip.techiussolutions.in/symbols/symbol-1764572039340-856243047.jpeg
GET 404 https://easyslip.techiussolutions.in/symbols/symbol-1764597888880-523685390.png
```

## Root Cause
The application stores uploaded symbol images in the local filesystem (`public/symbols/`). When running on AWS App Runner or similar container-based platforms:
- **Local filesystem is ephemeral** - it exists only during the container's lifetime
- Files are deleted on container restart/redeploy
- Symbols uploaded before the restart become unavailable

### Why Only Some Symbols Are Missing?

**Timeline Analysis** (from the 404 errors):
- **Symbol 3**: Uploaded Dec 1, 6:53 AM IST
- **Symbols 1, 2, 4**: Uploaded Dec 1, 2:04-2:08 PM IST  
- **404 Errors**: Occurred Dec 2, 3:41 AM IST

**What Happened**:
1. Symbols were uploaded and saved to local filesystem (`public/symbols/`)
2. Server was restarted/redeployed sometime between Dec 1 (2:08 PM) and Dec 2 (3:41 AM)
3. The restart wiped the ephemeral filesystem
4. All 4 symbols became unavailable (404 errors)

**Why Different Timestamps**:
- Symbols have different upload times based on when users added them
- All symbols in the current deployment cycle are lost together on restart
- Symbols that appear to be working were likely uploaded AFTER the most recent restart
- The pattern will repeat: next restart will wipe those newer symbols too

**Key Insight**: It's not that "some symbols work and some don't" - rather, ALL symbols uploaded before the last restart are gone, and any symbols uploaded AFTER the last restart are still available (until the next restart).

## Current Temporary Fix (Applied)
Added fallback route in `server.js` to serve placeholder SVG when symbol images are missing:
```javascript
app.get('/symbols/*', (req, res) => {
    // Logs which symbol is missing
    logger.warn(`Symbol image not found: ${requestedSymbol}`);
    // Serves an SVG placeholder: "Symbol Missing"
});
```

**This prevents 404 errors but doesn't solve the root problem.**

## Verification Commands

Check which symbols are currently missing:
```bash
# In production environment
ls -la public/symbols/

# Check database for symbol records
# Compare with actual files on disk to see the mismatch
```

Expected behavior: Database has records for all symbols, but filesystem only has symbols uploaded since the last restart.

## Permanent Solution Options

### Option 1: AWS S3 Storage (Recommended)
**Pros:**
- Persistent storage
- Scalable
- Fast CDN integration with CloudFront
- Cost-effective for images

**Implementation:**
1. Install AWS SDK: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
2. Update multer configuration to use S3
3. Update symbol upload controller
4. Set environment variables for AWS credentials

**Estimated Time:** 2-3 hours

### Option 2: Google Cloud Storage
**Pros:**
- Similar to S3
- Good integration with Firebase

**Implementation:**
Similar to S3, using `@google-cloud/storage`

**Estimated Time:** 2-3 hours

### Option 3: AWS EFS (Elastic File System)
**Pros:**
- Works like local filesystem
- Minimal code changes
- Persistent across container restarts

**Cons:**
- More expensive than S3
- Requires VPC configuration

**Estimated Time:** 1-2 hours (infrastructure setup)

### Option 4: Database BLOB Storage (Not Recommended)
**Pros:**
- No external dependencies

**Cons:**
- Poor performance for images
- Database bloat
- Expensive queries

## Recommended Implementation: AWS S3

### Step 1: Install Dependencies
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer-s3
```

### Step 2: Update Environment Variables
Add to `.env`:
```env
AWS_REGION=ap-south-1
AWS_S3_BUCKET=easyslip-symbols
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### Step 3: Create S3 Upload Configuration
Create `config/s3Upload.js`:
```javascript
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import multer from 'multer';
import path from 'path';

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

export const uploadToS3 = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'symbols/symbol-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});
```

### Step 4: Update adminController.js
```javascript
import { uploadToS3 } from '../config/s3Upload.js';

export const uploadSymbol = async (req, res) => {
    try {
        const { name, nameMalayalam, category } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'Symbol image is required'
            });
        }

        // S3 URL is available in req.file.location
        const imageUrl = req.file.location;

        const symbol = new Symbol({
            name,
            nameMalayalam: nameMalayalam || '',
            imageUrl,
            category: category || 'political-party',
            uploadedBy: req.userId
        });

        await symbol.save();

        res.status(201).json({
            status: 'success',
            message: 'Symbol uploaded successfully',
            symbol
        });
    } catch (error) {
        console.error('Upload symbol error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to upload symbol',
            error: error.message
        });
    }
};
```

### Step 5: Update routes/admin.js
```javascript
import { uploadToS3 } from '../config/s3Upload.js';

// Replace existing upload with uploadToS3
router.post('/symbols', uploadToS3.single('image'), uploadSymbol);
router.put('/symbols/:symbolId', uploadToS3.single('image'), updateSymbol);
```

## Migration Plan for Existing Symbols

### Option A: Manual Re-upload
Ask admin to re-upload all symbols through the admin panel.

### Option B: Automated Migration Script
Create `scripts/migrate-symbols-to-s3.js`:
```javascript
import Symbol from '../models/Symbol.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const s3 = new S3Client({ /* config */ });

async function migrateSymbols() {
    const symbols = await Symbol.find({});
    
    for (const symbol of symbols) {
        const localPath = path.join(__dirname, '..', 'public', symbol.imageUrl);
        
        if (fs.existsSync(localPath)) {
            const fileContent = fs.readFileSync(localPath);
            const key = `symbols/${path.basename(symbol.imageUrl)}`;
            
            await s3.send(new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: key,
                Body: fileContent,
                ContentType: 'image/*'
            }));
            
            symbol.imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
            await symbol.save();
            
            console.log(`✅ Migrated: ${symbol.name}`);
        } else {
            console.log(`❌ Missing: ${symbol.name} - ${symbol.imageUrl}`);
        }
    }
}

migrateSymbols().then(() => console.log('Migration complete!'));
```

## Testing Checklist
- [ ] Upload new symbol through admin panel
- [ ] Verify symbol appears in user symbol selection
- [ ] Restart server and verify symbol still accessible
- [ ] Check symbol URLs in database match S3 URLs
- [ ] Test symbol deletion (should remove from S3)
- [ ] Verify old symbols display placeholder until migrated

## Cost Estimate (AWS S3)
- Storage: ~$0.023 per GB/month
- Requests: First 1M GET requests free, then $0.0004/1000 requests
- Data Transfer: First 1GB/month free, then $0.09/GB

**Expected monthly cost for 1000 symbols (~500MB):** < $1

---

**Status:** Temporary fix applied (placeholder SVG)  
**Next Steps:** Implement S3 storage for permanent solution  
**Priority:** High (affects user experience)  
**Date:** December 2, 2025
