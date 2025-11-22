# Railway Deployment - Environment Variables

## 🚀 Copy these to Railway Dashboard

### **Required Variables:**

```bash
# Server
NODE_ENV=production
PORT=3000

# Database (Your MongoDB Atlas)
MONGODB_URI=mongodb+srv://voterslip_user:4pEHMR15wdIdxG2p@cluster0.d5rcpkw.mongodb.net/voterslips?retryWrites=true&w=majority&appName=Cluster0

# JWT Secret (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=d31f48b3e44ac2aca228bc9d593b2c6127a784c6522bd1c700822d83a61cd4a047bae8439dab797201f5a1c4276f8fd3da6579e76156d585d733e7045fe5d3cf

# Razorpay (Change to LIVE keys for production)
RAZORPAY_KEY_ID=rzp_test_RdDCF3lkljWONH
RAZORPAY_KEY_SECRET=IjlTZMb1qn4ZkBWVNzEPsfHL
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Kerala SEC Portal
SEC_BASE_URL=https://sec.kerala.gov.in
```

---

## 📧 Optional: Email Settings (Add later in Railway Settings)

```bash
# Gmail SMTP Example
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourapp.com
FROM_NAME=Kerala Voter Slips
```

---

## ⚠️ IMPORTANT: Security for Production

Before deploying to production:

### 1. **Change Razorpay to LIVE Keys**
```bash
# Login to https://dashboard.razorpay.com/
# Go to Settings → API Keys → Generate Live Keys
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXX
```

---

## 🔐 Protected Frontend Deployment (Updated November 2025)

Railway will automatically serve the **protected/obfuscated** version of your frontend.

### Automatic Protection Process:
1. **Railway runs**: `npm install` (installs dependencies including obfuscation tools)
2. **Railway executes**: The updated start command that includes protection
3. **Protection runs**: `npm run protect:safe` generates obfuscated files in `frontend-protected/`
4. **Server starts**: With `USE_PROTECTED=true` environment variable
5. **Frontend served**: From protected directory with obfuscated JavaScript

### Updated package.json Start Script:
```json
"start": "npm run protect:safe && cross-env USE_PROTECTED=true NODE_ENV=production node server.js"
```

### Railway Configuration (railway.json):
```json
{
  "deploy": {
    "startCommand": "npm run protect:safe && cross-env USE_PROTECTED=true NODE_ENV=production node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### What Gets Protected:
- All inline JavaScript in HTML files gets obfuscated
- Variable names scrambled (business logic hidden)
- String arrays rotated and encoded
- Control flow remains intact (no crashes)
- All static assets copied (CSS, images, fonts, etc.)

### CSP Security:
- Configured for all external services (payments, fonts, analytics)
- Allows necessary blob URLs for PDF processing
- Maintains security while enabling functionality

## Deploy Commands:

### Deploy to Railway:
```bash
git add .
git commit -m "Deploy with protected frontend"
git push origin main
```

### Test Locally (Production Mode):
```bash
npm run protect:safe
cross-env USE_PROTECTED=true NODE_ENV=production node server.js
```

## Status: ✅ Ready for Protected Railway Deployment
RAZORPAY_KEY_SECRET=XXXXXXXXXX
```

### 2. **Generate New JWT Secret**
```bash
# Run this in PowerShell:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Use the output as your new JWT_SECRET
```

### 3. **Setup Razorpay Webhook**
```bash
# After deployment, get your Railway URL: https://yourapp.railway.app
# Go to Razorpay Dashboard → Webhooks
# Add: https://yourapp.railway.app/api/payment/webhook
# Copy the webhook secret and update RAZORPAY_WEBHOOK_SECRET
```

---

## 🎯 Railway Deployment Steps

### **Step 1: Push to GitHub**
```powershell
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### **Step 2: Deploy to Railway**
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `jithinjissac/keralaelection`
5. Railway auto-detects Node.js

### **Step 3: Add Environment Variables**
1. Click on your project
2. Go to "Variables" tab
3. Click "New Variable"
4. Copy-paste ALL variables from above
5. Click "Deploy"

### **Step 4: Get Your URL**
1. Go to "Settings" tab
2. Click "Generate Domain"
3. Get URL: `yourapp.railway.app`

---

## ✅ Verification Checklist

After deployment:

- [ ] Visit: `https://yourapp.railway.app`
- [ ] Test login: `https://yourapp.railway.app/login.html`
- [ ] Test admin: `https://yourapp.railway.app/admin.html`
- [ ] Create test order
- [ ] Check Playwright works (PDF generation)
- [ ] Verify MongoDB connection
- [ ] Test Razorpay payment

---

## 🔧 Troubleshooting

### **Issue: Playwright doesn't work on Railway**
✅ **Solution**: Railway handles Playwright automatically! No extra config needed.

### **Issue: MongoDB connection fails**
✅ **Solution**: 
1. Check MongoDB Atlas → Network Access
2. Allow all IPs: `0.0.0.0/0`
3. Verify connection string is correct

### **Issue: PDFs not generating**
✅ **Solution**: Railway has persistent storage, PDFs will work fine.

### **Issue: Frontend not loading**
✅ **Solution**: Railway serves static files automatically from your project.

---

## 📊 Expected Costs

### **Railway Free Tier:**
- $5 credit per month
- ~500 hours runtime
- Good for testing & development

### **Railway Pro:**
- $5/month (usage-based)
- + ~$5-10 for your app
- **Total: $10-15/month**

### **MongoDB Atlas:**
- FREE tier (512MB)
- Already using this ✅

---

## 🎉 You're Ready!

Your project is **production-ready** with:
✅ MongoDB Atlas (cloud database)
✅ Environment variables configured
✅ Razorpay payment integration
✅ Email settings system
✅ Admin dashboard
✅ Playwright automation

**Next Step**: Deploy to Railway! 🚀

---

## 📞 Support

If Railway deployment fails, try:
1. Check build logs in Railway dashboard
2. Verify all env variables are set
3. Check MongoDB Atlas network access
4. Contact Railway support (excellent response time)

**Alternative**: Use Render.com (also supports Playwright)
