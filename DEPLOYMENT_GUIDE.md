# Kerala Voter Information Slip Generator - Complete Deployment Guide

## 🎯 Overview
This is a complete SaaS platform for generating customized voter information slips with payment integration, user authentication, and dashboard management.

## 📋 Prerequisites

### 1. Node.js Installation
- Download and install Node.js (v16 or higher) from https://nodejs.org/
- Verify installation:
  ```bash
  node --version
  npm --version
  ```

### 2. MongoDB Setup
You have two options:

#### Option A: MongoDB Atlas (Cloud - Recommended)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a new cluster (Free tier available)
4. Click "Connect" → "Connect your application"
5. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/voterslips`)
6. Replace `<password>` with your actual password
7. Add this to your `.env` file

#### Option B: MongoDB Local Installation
1. Download MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Install and run MongoDB locally
3. Use connection string: `mongodb://localhost:27017/voterslips`

### 3. Razorpay Account Setup
1. Go to https://razorpay.com/
2. Sign up for an account
3. Complete KYC verification (required for live mode)
4. Go to Settings → API Keys
5. Generate Test/Live API keys
6. Copy `key_id` and `key_secret`

## 🔧 Installation Steps

### Step 1: Install Dependencies
```bash
cd C:\Users\jesly\electionnew
npm install
```

This will install all required packages including:
- express, mongoose, bcryptjs, jsonwebtoken
- razorpay, puppeteer, playwright
- express-validator, dotenv, cheerio, axios

### Step 2: Configure Environment Variables
Open the `.env` file and update with your credentials:

```env
# Server Configuration
PORT=3000

# Database
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/voterslips?retryWrites=true&w=majority

# JWT Secret (Generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Session Secret
SESSION_SECRET=your-session-secret-key
```

#### How to Generate JWT_SECRET:
Run this in Node.js console:
```javascript
require('crypto').randomBytes(64).toString('hex')
```

### Step 3: Install Playwright Browsers
Playwright needs browser binaries:
```bash
npx playwright install chromium
```

### Step 4: Test Database Connection
Create a test file `test-db.js`:
```javascript
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
```

Run:
```bash
node test-db.js
```

## 🚀 Running the Application

### Development Mode
```bash
npm start
```

This will start the server on http://localhost:3000

### Test the Application
1. Open browser and go to http://localhost:3000
2. You should see the Malayalam landing page
3. Click "രജിസ്റ്റർ ചെയ്യുക" to create an account
4. After registration, you'll be redirected to the dashboard

## 📁 Project Structure

```
electionnew/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── .env                      # Environment variables
│
├── config/
│   ├── database.js          # MongoDB connection
│   └── razorpay.js          # Razorpay initialization
│
├── models/
│   ├── User.js              # User schema
│   └── Order.js             # Order schema
│
├── controllers/
│   ├── authController.js    # Authentication logic
│   ├── orderController.js   # Order management
│   ├── paymentController.js # Razorpay integration
│   ├── slipController.js    # PDF generation
│   ├── dropdownController.js # SEC data extraction
│   ├── voterController.js   # Voter list extraction
│   └── captchaController.js # Captcha handling
│
├── middleware/
│   └── auth.js              # JWT authentication
│
├── routes/
│   ├── auth.js              # Auth routes
│   ├── orders.js            # Order routes
│   ├── payment.js           # Payment routes
│   └── slips.js             # Slip generation routes
│
├── frontend/
│   ├── index.html           # Landing page (Malayalam)
│   ├── login.html           # Login page
│   ├── register.html        # Registration page
│   ├── dashboard.html       # User dashboard
│   ├── index.html           # Voter extraction form
│   ├── slips.html           # Original slip generator
│   └── styles.css
│
├── utils/
│   ├── parser.js            # HTML parsing
│   └── playwright.js        # Browser automation
│
└── public/
    └── captcha-cache/       # Temporary captcha storage
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile (requires auth)

### Orders
- `POST /api/orders/create` - Create new order
- `GET /api/orders` - Get user orders (requires auth)
- `GET /api/orders/:orderId` - Get order details
- `GET /api/orders/stats/summary` - Get order statistics

### Payment
- `POST /api/payment/create-order` - Create Razorpay order
- `POST /api/payment/verify` - Verify payment signature
- `POST /api/payment/webhook` - Razorpay webhook handler

### Slips
- `POST /api/slips/preview` - Generate preview (10 slips)
- `GET /api/slips/download/:orderId` - Download full PDF

### SEC Data Extraction (Existing)
- `GET /api/dropdown/:type` - Get district/localBody/ward/booth data
- `POST /api/voters/extract` - Extract voter list
- `POST /api/captcha/store` - Store captcha for session

## 💳 Payment Flow

1. User creates order with customization and voter data
2. Frontend calls `POST /api/orders/create`
3. Order is created with `paymentStatus: 'pending'`
4. Frontend calls `POST /api/payment/create-order`
5. Razorpay order is created
6. User completes payment on Razorpay checkout
7. Frontend calls `POST /api/payment/verify` with payment details
8. Server verifies signature and updates order to `paymentStatus: 'completed'`
9. User can now download the PDF

## 📄 PDF Generation

### Preview (Free)
- First 10 slips (2 pages)
- Generated on-demand with Puppeteer
- No payment required

### Full PDF (Paid)
- All voter information slips
- A4 format, 5 slips per page
- Includes cutting guides
- Generated on-demand (no file storage)
- Can be downloaded multiple times

## 🎨 Customization Options

Users can customize:
- **Party Logo**: Upload PNG/JPG (base64 encoded)
- **Party Name**: Text displayed on slip
- **Symbol Text**: Malayalam text above logo
- **Colors**: Custom color schemes (future feature)

## 💰 Pricing Structure

| Voter Count | Price per Voter | Discount |
|-------------|----------------|----------|
| 1-100       | ₹0.50         | 0%       |
| 101-500     | ₹0.45         | 10%      |
| 501-1000    | ₹0.40         | 20%      |
| 1000+       | ₹0.35         | 30%      |

## 🔒 Security Features

1. **Password Hashing**: bcrypt with 10 salt rounds
2. **JWT Authentication**: 30-day token expiry
3. **Razorpay Signature Verification**: HMAC SHA256
4. **Input Validation**: express-validator
5. **HTTPS**: Required for production

## 🐛 Troubleshooting

### MongoDB Connection Error
```
Error: MongooseServerSelectionError
```
**Solution**: Check MONGODB_URI in .env, verify network access in MongoDB Atlas

### Razorpay Payment Fails
```
Error: Invalid key_id or key_secret
```
**Solution**: Verify Razorpay credentials in .env, ensure you're using correct mode (test/live)

### Puppeteer PDF Generation Error
```
Error: Failed to launch browser
```
**Solution**: Run `npx playwright install chromium` to install browser

### JWT Token Expired
```
401 Unauthorized
```
**Solution**: User needs to login again, token expires after 30 days

## 📱 Frontend Pages

### Landing Page (`index.html`)
- Malayalam content
- Pricing table
- How it works section
- Features showcase
- CTA buttons

### Login Page (`login.html`)
- Email or phone login
- Password authentication
- Redirects to dashboard

### Register Page (`register.html`)
- Name, email, phone, password
- Validation with error messages
- Auto-login after registration

### Dashboard (`dashboard.html`)
- User profile display
- Order statistics (total, completed, voters, amount)
- Order list with filters (all, completed, pending)
- Download buttons for completed orders
- Create new slip button

## 🔄 Development Workflow

1. **User Registration**: `register.html` → `/api/auth/register` → Dashboard
2. **Login**: `login.html` → `/api/auth/login` → Dashboard
3. **Create Slip**: Dashboard → `create-slip.html` (TO BE CREATED)
4. **Extract Voters**: Use existing `index.html` for SEC data extraction
5. **Preview**: Generate preview PDF → Show pricing
6. **Payment**: Razorpay checkout → Verify payment
7. **Download**: Download full PDF from dashboard

## 🚀 Next Steps

You need to create:
1. **create-slip.html** - Multi-step slip creation workflow
2. **preview.html** - Show preview and payment page
3. **order-success.html** - Payment confirmation page

These will integrate the existing voter extraction (`index.html`) with the new payment flow.

## 📞 Support

For issues:
1. Check server logs in terminal
2. Check browser console for frontend errors
3. Verify MongoDB connection
4. Test Razorpay credentials in test mode first

## 🎉 Testing Checklist

- [ ] MongoDB connected successfully
- [ ] User can register
- [ ] User can login
- [ ] Dashboard loads with stats
- [ ] Can create test order
- [ ] Razorpay test payment works
- [ ] PDF preview generates
- [ ] Full PDF downloads after payment
- [ ] User can download multiple times

---

**Ready to launch your voter information slip SaaS platform!** 🚀
