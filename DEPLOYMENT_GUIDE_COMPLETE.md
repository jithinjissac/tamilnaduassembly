# Deployment Guide - Kerala SEC Voter API

## 🚀 Quick Deploy Options

### **Option 1: Railway (Easiest)**

#### **Step 1: Prepare Repository**
```bash
# Make sure code is on GitHub
git add .
git commit -m "Ready for deployment"
git push origin main
```

#### **Step 2: Deploy to Railway**
1. Go to https://railway.app
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Railway will auto-detect Node.js

#### **Step 3: Add MongoDB**
1. Click "+ New" → "Database" → "MongoDB"
2. Railway creates managed MongoDB
3. Connection string auto-added to environment

#### **Step 4: Configure Environment**
```bash
# Add these in Railway Settings → Variables:
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
JWT_SECRET=your_jwt_secret_min_32_chars
NODE_ENV=production

# Email settings (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password
```

#### **Step 5: Deploy**
- Railway auto-deploys on push
- Get URL: `yourapp.railway.app`

#### **Cost:**
- Free: $5 credit/month (enough for testing)
- Paid: ~$10-15/month for production

---

### **Option 2: Render (Free Tier Available)**

#### **Step 1: Create render.yaml**
```yaml
services:
  - type: web
    name: kerala-voter-api
    env: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        fromDatabase:
          name: kerala-voter-db
          property: connectionString
      - key: RAZORPAY_KEY_ID
        sync: false
      - key: RAZORPAY_KEY_SECRET
        sync: false
      - key: JWT_SECRET
        generateValue: true
    
databases:
  - name: kerala-voter-db
    databaseName: voterslips
    user: voterapp
```

#### **Step 2: Deploy**
1. Go to https://render.com
2. New → Web Service
3. Connect GitHub repo
4. Render detects Dockerfile
5. Set environment variables
6. Deploy

#### **Cost:**
- Free tier available (with limitations)
- Paid: $7/month

---

### **Option 3: DigitalOcean (Production)**

#### **Step 1: Install doctl CLI**
```bash
# Install DigitalOcean CLI
npm install -g doctl
doctl auth init
```

#### **Step 2: Create App Spec**
```yaml
name: kerala-voter-api
services:
  - name: api
    dockerfile_path: Dockerfile
    github:
      repo: your-username/keralaelection
      branch: main
    envs:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        value: ${db.CONNECTION_STRING}
    http_port: 3000

databases:
  - name: kerala-voter-db
    engine: MONGODB
    production: true
```

#### **Step 3: Deploy**
```bash
doctl apps create --spec app-spec.yaml
```

#### **Cost:**
- App: $5/month (basic)
- MongoDB: $15/month (managed)
- Total: ~$20/month

---

### **Option 4: AWS (Most Scalable)**

#### **Step 1: Setup AWS Account**
1. Create AWS account
2. Install AWS CLI
3. Configure credentials

#### **Step 2: Create ECR Repository**
```bash
# Create repository for Docker image
aws ecr create-repository --repository-name kerala-voter-api

# Build and push Docker image
docker build -t kerala-voter-api .
docker tag kerala-voter-api:latest YOUR_ECR_URI
docker push YOUR_ECR_URI
```

#### **Step 3: Deploy to ECS**
1. Create ECS cluster
2. Create task definition
3. Create service
4. Configure load balancer

#### **Step 4: Setup MongoDB Atlas**
1. Create cluster at mongodb.com
2. Get connection string
3. Add to ECS environment variables

#### **Cost:**
- Free tier: First 12 months
- After: $10-30/month

---

## 🔧 Pre-Deployment Configuration

### **1. Update package.json**
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "echo 'No build step required'",
    "postinstall": "npx playwright install chromium"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

### **2. Create .dockerignore**
```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
generated-pdfs/*
!generated-pdfs/.gitkeep
```

### **3. Environment Variables Template**
```bash
# Server
PORT=3000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/voterslips

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx

# JWT
JWT_SECRET=your-super-secret-key-min-32-characters

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourapp.com
FROM_NAME=Kerala Voter Slips

# Frontend URL (for CORS)
FRONTEND_URL=https://yourapp.com
```

---

## 📦 **Database Options**

### **1. MongoDB Atlas** (Recommended)
```
✅ Free tier: 512MB
✅ Global CDN
✅ Automated backups
✅ Easy setup

Cost: Free → $9/month → $57/month
URL: mongodb.com/cloud/atlas
```

### **2. Railway MongoDB**
```
✅ One-click setup
✅ Auto-configured
✅ Simple pricing

Cost: Included in Railway plan
```

### **3. DigitalOcean Managed MongoDB**
```
✅ High performance
✅ Automated backups
✅ Monitoring included

Cost: $15/month minimum
```

---

## 📊 **Cost Comparison**

| Platform | Free Tier | Starter | Production |
|----------|-----------|---------|------------|
| **Railway** | $5 credit/mo | $10-15/mo | $20-50/mo |
| **Render** | ✅ Limited | $7/mo | $25-50/mo |
| **DigitalOcean** | ❌ | $5/mo | $20-40/mo |
| **Heroku** | ❌ | $7/mo | $25-50/mo |
| **AWS** | 12 months | $10/mo | $30-100/mo |

---

## 🎯 **My Recommendation:**

### **For Testing/MVP: Railway**
```bash
✅ Easiest deployment
✅ Free tier available
✅ Handles Playwright automatically
✅ Auto-deploys from GitHub

Steps:
1. Push to GitHub
2. Connect to Railway
3. Add MongoDB plugin
4. Set env vars
5. Done! 🚀
```

### **For Production: DigitalOcean + MongoDB Atlas**
```bash
✅ Professional setup
✅ Good performance
✅ Reasonable cost
✅ Easy to scale

Steps:
1. Deploy app to DigitalOcean App Platform
2. Use MongoDB Atlas for database
3. Use DigitalOcean Spaces for PDF storage
4. Setup CDN for frontend
5. Configure domain
```

---

## 🔐 **Security Checklist**

Before deploying:

- [ ] Change JWT_SECRET to strong random string
- [ ] Use Razorpay LIVE keys (not test)
- [ ] Enable HTTPS (SSL)
- [ ] Set NODE_ENV=production
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Setup MongoDB authentication
- [ ] Use environment variables (never hardcode secrets)
- [ ] Enable MongoDB IP whitelist
- [ ] Setup automated backups
- [ ] Configure error logging (Sentry/LogRocket)

---

## 🚨 **Common Issues & Solutions**

### **Issue: Playwright doesn't work**
```bash
# Solution: Use Dockerfile with dependencies
# Or use Railway/Render (handles automatically)
```

### **Issue: PDFs get deleted**
```bash
# Solution: Use persistent storage
# Railway: Persistent volumes
# AWS: S3 bucket
# DigitalOcean: Spaces
```

### **Issue: MongoDB connection fails**
```bash
# Check: IP whitelist (allow all: 0.0.0.0/0)
# Check: Connection string format
# Check: Username/password special characters
```

### **Issue: High memory usage**
```bash
# Solution: Limit concurrent PDF generation
# Close browser instances properly
# Use browser pooling
```

---

## 📞 **Support & Monitoring**

### **Logging Services:**
- **Sentry**: Error tracking (free tier)
- **LogRocket**: Session replay
- **Papertrail**: Log aggregation

### **Monitoring:**
- **UptimeRobot**: Free uptime monitoring
- **New Relic**: APM monitoring
- **DataDog**: Full-stack monitoring

---

## 🎉 **Quick Start (Railway)**

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize
railway init

# 4. Add MongoDB
railway add

# 5. Deploy
railway up

# 6. Get URL
railway domain

# Done! Your app is live 🚀
```

---

## 📚 **Next Steps After Deployment**

1. **Setup Custom Domain**
   - Buy domain (Namecheap, GoDaddy)
   - Configure DNS records
   - Enable SSL

2. **Configure Email**
   - Setup SendGrid/Mailgun for production
   - Configure SPF/DKIM records
   - Test email delivery

3. **Setup Monitoring**
   - Configure uptime monitoring
   - Setup error tracking
   - Enable performance monitoring

4. **Backups**
   - Automated database backups
   - PDF storage backups
   - Configuration backups

5. **CI/CD**
   - Auto-deploy on push
   - Run tests before deploy
   - Environment-based deployments

---

**Choose Railway for quick MVP, DigitalOcean for serious production! 🚀**
