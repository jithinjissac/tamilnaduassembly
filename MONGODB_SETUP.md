# 🗄️ MongoDB Setup Guide - Complete Instructions

## Option 1: MongoDB Atlas (Cloud - Recommended) ⭐

### Step 1: Create Account (2 minutes)
1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up with:
   - Google account (easiest), OR
   - Email and password
3. Complete the registration

### Step 2: Create Free Cluster (3 minutes)
1. After login, click **"Build a Database"** or **"Create"**
2. Choose **"M0 FREE"** tier (512MB storage - perfect for testing)
3. Select:
   - **Provider:** AWS (recommended) or Google Cloud
   - **Region:** Choose closest to you (e.g., Mumbai for India)
   - **Cluster Name:** Leave default or name it "VoterSlipCluster"
4. Click **"Create Cluster"** (takes 1-3 minutes to provision)

### Step 3: Create Database User (1 minute)
1. Click **"Database Access"** in left sidebar
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Enter:
   - **Username:** `voterslip_user` (or any name you want)
   - **Password:** Click "Autogenerate Secure Password" and **COPY IT**
   - Or create your own strong password
5. Set **"Database User Privileges":** Read and write to any database
6. Click **"Add User"**

**⚠️ IMPORTANT: Save your password! You'll need it in the connection string.**

### Step 4: Allow Network Access (1 minute)
1. Click **"Network Access"** in left sidebar
2. Click **"Add IP Address"**
3. Click **"Allow Access from Anywhere"** (for development)
   - This adds `0.0.0.0/0` to allowlist
4. Click **"Confirm"**

**Note:** For production, restrict to specific IPs.

### Step 5: Get Connection String (1 minute)
1. Go back to **"Database"** (click "Database" in left sidebar)
2. Click **"Connect"** button on your cluster
3. Choose **"Connect your application"**
4. Select:
   - **Driver:** Node.js
   - **Version:** 5.5 or later
5. **Copy the connection string** - it looks like:
   ```
   mongodb+srv://voterslip_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. **Replace `<password>`** with your actual password
7. Add database name before the `?`:
   ```
   mongodb+srv://voterslip_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/voterslips?retryWrites=true&w=majority
   ```

### Step 6: Update .env File
Open your `.env` file and add:
```env
MONGODB_URI=mongodb+srv://voterslip_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/voterslips?retryWrites=true&w=majority
```

**✅ Done! MongoDB Atlas is ready.**

---

## Option 2: Local MongoDB (Windows) 🖥️

### Step 1: Download MongoDB (5 minutes)
1. Go to: https://www.mongodb.com/try/download/community
2. Select:
   - **Version:** Current (7.0.x)
   - **Platform:** Windows
   - **Package:** MSI
3. Click **"Download"**

### Step 2: Install MongoDB (5 minutes)
1. Run the downloaded `.msi` file
2. Choose **"Complete"** installation
3. Installation options:
   - ✅ Install MongoDB as a Service (check this)
   - ✅ Run service as Network Service user
   - ✅ Install MongoDB Compass (optional GUI - recommended)
4. Click **"Next"** → **"Install"**
5. Wait for installation to complete

### Step 3: Verify Installation (1 minute)
Open PowerShell and run:
```powershell
mongod --version
```
You should see version information.

### Step 4: Start MongoDB Service
MongoDB should start automatically. If not:
```powershell
# Start MongoDB service
net start MongoDB

# Check if running
Get-Service MongoDB
```

### Step 5: Update .env File
Open your `.env` file and add:
```env
MONGODB_URI=mongodb://localhost:27017/voterslips
```

**✅ Done! Local MongoDB is ready.**

---

## Option 3: MongoDB Compass (GUI) 🎨

If you installed MongoDB Compass, you can:

1. Open MongoDB Compass
2. For **Atlas**: Paste your connection string
3. For **Local**: Use `mongodb://localhost:27017`
4. Click **"Connect"**
5. View/manage databases visually

---

## Step 7: Generate JWT Secret 🔐

You also need a JWT secret for authentication.

Run this command in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

This will output something like:
```
8f7a9b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Copy this and add to `.env`:
```env
JWT_SECRET=8f7a9b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

---

## Step 8: Add Razorpay Keys (Optional for now) 💳

For testing, you can use placeholder values:
```env
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
RAZORPAY_WEBHOOK_SECRET=placeholder_webhook
```

**To get real keys:**
1. Go to: https://dashboard.razorpay.com/signup
2. Sign up
3. Go to: Settings → API Keys
4. Click "Generate Test Keys"
5. Copy Key ID and Secret

---

## Complete .env File Example

Your `.env` should look like this:

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB (Choose one option)
# Option A: MongoDB Atlas (Cloud)
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/voterslips?retryWrites=true&w=majority

# Option B: Local MongoDB
# MONGODB_URI=mongodb://localhost:27017/voterslips

# JWT Secret (Generate with crypto)
JWT_SECRET=your-64-character-random-string-here

# Razorpay (Test mode)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=webhook_secret_here
```

---

## Step 9: Test Connection 🧪

Start your server:
```powershell
npm start
```

You should see:
```
✅ MongoDB Connected Successfully
🚀 Server running on http://localhost:3000
```

If you see this, **you're all set!** ✅

---

## Troubleshooting 🔧

### Error: "MongooseServerSelectionError"
**Solution:**
- Check internet connection (for Atlas)
- Verify MONGODB_URI is correct
- For Atlas: Check Network Access allows your IP
- For Local: Ensure MongoDB service is running

### Error: "Authentication failed"
**Solution:**
- Check username and password in connection string
- Ensure password doesn't contain special characters (or URL encode them)
- Verify user has correct permissions

### Error: "connect ECONNREFUSED"
**Solution (Local MongoDB):**
- Start MongoDB service: `net start MongoDB`
- Check if MongoDB is running: `Get-Service MongoDB`

### MongoDB Service won't start
**Solution:**
```powershell
# Check status
Get-Service MongoDB

# Try to start
net start MongoDB

# If fails, reinstall MongoDB with "Install as Service" option
```

---

## Quick Reference 📋

### MongoDB Atlas URLs
- **Sign Up:** https://www.mongodb.com/cloud/atlas/register
- **Dashboard:** https://cloud.mongodb.com/

### MongoDB Local Download
- **Community:** https://www.mongodb.com/try/download/community
- **Compass GUI:** https://www.mongodb.com/try/download/compass

### Razorpay
- **Sign Up:** https://dashboard.razorpay.com/signup
- **Dashboard:** https://dashboard.razorpay.com/

---

## Next Steps After Setup ➡️

1. ✅ MongoDB connected
2. ✅ JWT secret generated
3. ✅ Server starts successfully
4. **Test the application:**
   - Visit: http://localhost:3000
   - Register a new user
   - Login
   - Create a voter information slip

---

## Need Help? 🆘

**Common Commands:**
```powershell
# Check MongoDB status (Windows)
Get-Service MongoDB

# Start MongoDB
net start MongoDB

# Stop MongoDB
net stop MongoDB

# View logs (if issues)
# Located at: C:\Program Files\MongoDB\Server\7.0\log\mongod.log
```

**Test MongoDB Connection:**
```powershell
# Install MongoDB Shell (if not installed)
# Download from: https://www.mongodb.com/try/download/shell

# Connect to local
mongosh

# Connect to Atlas
mongosh "mongodb+srv://cluster0.xxxxx.mongodb.net/" --username yourusername
```

---

## 🎉 You're Ready!

Once you see "✅ MongoDB Connected Successfully" in your terminal, your database is working perfectly!

Now you can:
- Register users
- Create orders
- Process payments
- Generate PDFs
- Everything will be saved to MongoDB!
