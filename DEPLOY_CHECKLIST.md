# 🚀 Quick Deploy to Railway - Checklist

## ✅ Pre-Deployment (Local)

- [x] MongoDB Atlas configured ✅ (Already done!)
- [x] Razorpay test keys working ✅ (Already set!)
- [x] JWT secret configured ✅ (Already set!)
- [x] Admin user created (`admin@test.com`)
- [x] Email settings system working
- [x] Server runs locally without errors

---

## 📦 Step 1: Prepare for Deployment (2 minutes)

### **1.1 Update package.json** (Already correct)
```json
{
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "start": "node server.js"
  }
}
```

### **1.2 Commit all changes**
```powershell
git status
git add .
git commit -m "Production ready - Railway deployment"
git push origin main
```

---

## 🚂 Step 2: Deploy to Railway (5 minutes)

### **2.1 Create Railway Account**
1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign in with GitHub
4. Authorize Railway

### **2.2 Create New Project**
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose: `jithinjissac/keralaelection`
4. Railway starts building automatically

### **2.3 Wait for Build** (2-3 minutes)
- Railway detects Node.js
- Installs dependencies
- Installs Playwright automatically
- Shows build logs

---

## ⚙️ Step 3: Configure Environment (3 minutes)

### **3.1 Add Environment Variables**
Click on your project → "Variables" tab → Add these:

```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://voterslip_user:4pEHMR15wdIdxG2p@cluster0.d5rcpkw.mongodb.net/voterslips?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=d31f48b3e44ac2aca228bc9d593b2c6127a784c6522bd1c700822d83a61cd4a047bae8439dab797201f5a1c4276f8fd3da6579e76156d585d733e7045fe5d3cf
RAZORPAY_KEY_ID=rzp_test_RdDCF3lkljWONH
RAZORPAY_KEY_SECRET=IjlTZMb1qn4ZkBWVNzEPsfHL
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
SEC_BASE_URL=https://sec.kerala.gov.in
```

**Pro Tip**: Copy all at once, Railway will parse them!

### **3.2 Re-deploy**
- Click "Deploy" (top right)
- Wait ~2 minutes

---

## 🌐 Step 4: Get Your URL (1 minute)

### **4.1 Generate Domain**
1. Go to "Settings" tab
2. Scroll to "Domains"
3. Click "Generate Domain"
4. Get URL: `kerala-voter-XXXX.up.railway.app`

### **4.2 Save Your URL**
```
Production URL: https://kerala-voter-XXXX.up.railway.app
```

---

## ✅ Step 5: Test Everything (5 minutes)

### **5.1 Basic Tests**
- [ ] Visit your Railway URL
- [ ] Homepage loads
- [ ] Login page works: `/login.html`
- [ ] Register new user
- [ ] Login successfully

### **5.2 Admin Tests**
- [ ] Visit: `/admin.html`
- [ ] Login: `admin@test.com` / `admin123`
- [ ] Dashboard loads with stats
- [ ] Email settings page works

### **5.3 Core Features**
- [ ] Create slip page: `/create-slip.html`
- [ ] Select district/ward/polling station
- [ ] Preview voters (Playwright automation)
- [ ] Create order
- [ ] Test payment (use Razorpay test cards)
- [ ] PDF generates successfully
- [ ] Download PDF works

### **5.4 Email Test** (Optional)
- [ ] Configure SMTP in admin settings
- [ ] Send test email
- [ ] Email received successfully

---

## 🔒 Step 6: Security (Production) - IMPORTANT!

### **6.1 Change to Razorpay LIVE Keys**
```bash
# Get from: https://dashboard.razorpay.com/app/keys
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXX
```

### **6.2 Generate New JWT Secret**
```powershell
# Run in PowerShell:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Update in Railway Variables
```

### **6.3 Setup MongoDB Atlas Security**
1. Go to MongoDB Atlas
2. Network Access → Add IP Address
3. Add Railway's IPs or use `0.0.0.0/0` (allow all)
4. Database Access → Ensure user has correct permissions

### **6.4 Configure Razorpay Webhook**
```bash
# In Razorpay Dashboard:
Webhook URL: https://your-railway-app.railway.app/api/payment/webhook
Active Events: payment.captured, payment.failed
```

---

## 📊 Monitor Your Deployment

### **Railway Dashboard**
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Deployments**: Version history

### **Check Logs**
```bash
# In Railway dashboard, click "View Logs"
# Look for:
✅ MongoDB Connected Successfully
✅ Server running on http://...
✅ Razorpay initialized successfully
```

---

## 💰 Cost Monitoring

### **Free Tier Usage**
- $5 credit per month
- Monitor in Railway dashboard
- Set up billing alerts

### **When You Need Paid Plan**
- App exceeds $5/month usage
- Need more resources
- Pro plan: $5/month + usage (~$10-15 total)

---

## 🆘 Troubleshooting

### **Build Fails**
✅ Check build logs in Railway
✅ Verify package.json has correct start script
✅ Check Node.js version compatibility

### **App Crashes After Deploy**
✅ Check runtime logs
✅ Verify all environment variables are set
✅ Test MongoDB connection string

### **Playwright Doesn't Work**
✅ Railway installs Playwright automatically
✅ Check logs for Chromium installation
✅ Verify memory limits (increase if needed)

### **MongoDB Connection Fails**
✅ Check Network Access in Atlas (allow 0.0.0.0/0)
✅ Verify connection string format
✅ Check username/password (no special chars issues)

### **PDFs Not Saving**
✅ Railway has persistent storage
✅ Check `/generated-pdfs` directory exists
✅ Verify file permissions in logs

---

## 🎉 Success Criteria

Your deployment is successful when:

✅ Railway URL loads your app
✅ Users can register and login
✅ Admin dashboard accessible
✅ Playwright automation works (district/ward dropdowns populate)
✅ PDF generation works
✅ Razorpay payments process
✅ Downloads work correctly
✅ Email settings configurable
✅ No errors in Railway logs

---

## 📱 Next Steps After Deployment

### **1. Custom Domain** (Optional)
```bash
# In Railway Settings → Domains
# Add your custom domain: voters.yourdomain.com
# Configure DNS records as shown
# SSL certificate auto-generated
```

### **2. Production Email Setup**
```bash
# Use professional email service:
# - SendGrid (free tier: 100 emails/day)
# - Mailgun (free tier: 5000 emails/month)
# - AWS SES (cheap, scalable)
```

### **3. Monitoring & Alerts**
```bash
# Setup uptime monitoring:
# - UptimeRobot (free)
# - Better Uptime
# - Pingdom

# Error tracking:
# - Sentry (free tier)
# - LogRocket
```

### **4. Backups**
```bash
# MongoDB Atlas automatic backups ✅
# Export Railway environment variables (backup)
# Document your deployment process
```

---

## 📞 Support & Resources

### **Railway Support**
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- Email: team@railway.app

### **Your Resources**
- Railway Dashboard: Monitor, logs, settings
- MongoDB Atlas: Database management
- Razorpay Dashboard: Payment tracking
- GitHub Repo: Source code, issues

---

## ⏱️ Total Time: ~15 minutes

- Pre-deployment: 2 min
- Railway setup: 5 min  
- Configuration: 3 min
- Get URL: 1 min
- Testing: 5 min

**You're ready to go live! 🚀**

---

## 🎯 Quick Reference

```bash
# Your Production URLs (after deployment)
App: https://kerala-voter-XXXX.up.railway.app
Admin: https://kerala-voter-XXXX.up.railway.app/admin.html
Login: https://kerala-voter-XXXX.up.railway.app/login.html

# Admin Credentials
Email: admin@test.com
Password: admin123

# Support
Railway: https://railway.app
MongoDB: https://cloud.mongodb.com
Razorpay: https://dashboard.razorpay.com
```

**Good luck with your deployment! 🎉**
