# Voter Information Slip SaaS Platform Architecture

## Overview
A complete SaaS platform for generating customized voter information slips with payment integration.

## User Flow

### 1. Landing Page (Malayalam)
- **URL**: `/` or `/home`
- **Content**:
  - Hero section with Malayalam headline
  - How it works (workflow visualization)
  - Pricing: ₹0.50 per voter
  - Sample slip preview
  - Login/Register buttons
  - Features list

### 2. User Authentication
- **Registration**: Email, Password, Phone, Name
- **Login**: Email/Phone + Password
- **Dashboard Access**: After login

### 3. Dashboard (`/dashboard`)
- **My Orders**: List of all generated slips
  - Order ID
  - Local Body, Ward, Polling Station
  - Total Voters
  - Amount Paid
  - Status (Pending/Completed)
  - Download button (regenerates slip)
  - Created date
- **Create New Slip**: Button to start new order
- **Profile**: User details, payment history

### 4. Slip Customization (`/create-slip`)
#### Step 1: Party/Customization Details
- Upload party logo (or select from library)
- Party name in Malayalam
- Color scheme selection
- Symbol text (നമ്മുടെ ചിഹ്നം)
- Additional text fields

#### Step 2: Location Selection (existing form)
- District → Local Body → Ward → Polling Station
- Captcha verification
- Extract voter data

#### Step 3: Preview & Confirm
- Show first 2 pages (10 slips) as preview
- Display total voters count
- Calculate total cost: `voters × ₹0.50`
- "Proceed to Payment" button

### 5. Payment Integration (`/payment`)
- **Payment Gateway**: Razorpay/Paytm/PhonePe
- **Amount**: Total voters × ₹0.50
- **Order Details Summary**
- **Payment Methods**: UPI, Cards, Wallets, Net Banking

### 6. Order Confirmation (`/order/:orderId`)
- Payment success message
- Order details
- **Download Full Slip** button
- Link to dashboard

### 7. Download Process
- **On-demand generation**:
  1. Fetch order details from database
  2. Fetch voter data (stored in DB)
  3. Regenerate PDF with customization
  4. Stream PDF to user (no server storage)
  5. Log download event

## Technical Architecture

### Backend Structure
```
server.js                     # Main Express server
├── config/
│   ├── database.js           # MongoDB/PostgreSQL connection
│   ├── razorpay.js           # Payment gateway config
│   └── jwt.js                # JWT authentication config
├── models/
│   ├── User.js               # User schema
│   ├── Order.js              # Order schema
│   ├── VoterData.js          # Voter data schema (encrypted)
│   └── Customization.js      # Slip customization schema
├── controllers/
│   ├── authController.js     # Registration, login, JWT
│   ├── orderController.js    # Create order, list orders
│   ├── paymentController.js  # Razorpay integration
│   ├── slipController.js     # Generate PDF, preview
│   ├── dropdownController.js # Existing dropdown APIs
│   └── captchaController.js  # Existing captcha logic
├── middleware/
│   ├── auth.js               # JWT verification
│   └── rateLimit.js          # API rate limiting
├── routes/
│   ├── auth.js               # /api/auth/*
│   ├── orders.js             # /api/orders/*
│   ├── payment.js            # /api/payment/*
│   └── slips.js              # /api/slips/*
└── utils/
    ├── pdfGenerator.js       # Generate PDF from voter data
    ├── playwright.js         # Existing browser automation
    └── parser.js             # Existing HTML parser
```

### Frontend Structure
```
frontend/
├── index.html                # Landing page (Malayalam)
├── login.html                # Login page
├── register.html             # Registration page
├── dashboard.html            # User dashboard
├── create-slip.html          # Multi-step slip creation
├── preview.html              # Preview & payment page
├── order-success.html        # Payment success page
├── styles/
│   ├── landing.css           # Landing page styles
│   ├── dashboard.css         # Dashboard styles
│   └── common.css            # Shared styles
└── scripts/
    ├── landing.js            # Landing page logic
    ├── auth.js               # Login/register logic
    ├── dashboard.js          # Dashboard logic
    ├── createSlip.js         # Slip creation workflow
    └── payment.js            # Payment integration
```

### Database Schema

#### Users Collection/Table
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  phone: String (unique),
  password: String (hashed),
  createdAt: Date,
  lastLogin: Date
}
```

#### Orders Collection/Table
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  orderId: String (unique, e.g., "ORD-20250107-XXXX"),
  customization: {
    partyLogo: String (base64 or URL),
    partyName: String,
    symbolText: String,
    colorScheme: Object
  },
  location: {
    district: String,
    localBody: String,
    ward: String,
    pollingStation: String
  },
  voters: [{
    sl_no: String,
    name: String,
    guardian_name: String,
    house_no: String,
    house_name: String,
    gender_age: String,
    sec_id: String
  }],
  totalVoters: Number,
  amount: Number, // voters * 0.50
  paymentStatus: String (pending/completed/failed),
  paymentId: String, // Razorpay payment ID
  createdAt: Date,
  paidAt: Date,
  downloadCount: Number,
  lastDownloadAt: Date
}
```

## Payment Integration (Razorpay)

### Setup
```bash
npm install razorpay
```

### Flow
1. **Create Order**: Backend creates Razorpay order
2. **Frontend**: Open Razorpay checkout modal
3. **Payment Success**: Webhook/callback updates order status
4. **Enable Download**: Order status = "completed"

### API Endpoints

#### Authentication
```
POST /api/auth/register        # Register new user
POST /api/auth/login           # Login user
GET  /api/auth/profile         # Get user profile (JWT required)
```

#### Orders
```
GET  /api/orders               # List user's orders (JWT required)
POST /api/orders/create        # Create new order (JWT required)
GET  /api/orders/:orderId      # Get order details (JWT required)
```

#### Payment
```
POST /api/payment/create-order    # Create Razorpay order
POST /api/payment/verify          # Verify payment signature
POST /api/payment/webhook         # Razorpay webhook
```

#### Slips
```
POST /api/slips/preview           # Generate preview (first 2 pages)
GET  /api/slips/download/:orderId # Download full PDF (JWT required, paid orders only)
```

## PDF Generation Strategy

### For Preview (Free)
- Generate HTML slips for first 10 voters (2 pages)
- Use Puppeteer/Playwright to convert HTML → PDF
- Stream to browser (no storage)

### For Full Download (Paid)
- Fetch order from database
- Fetch all voters (encrypted in DB)
- Generate complete HTML with customization
- Convert to PDF using Puppeteer
- Set filename: `voters-slip-${orderId}.pdf`
- Stream to user (Content-Disposition: attachment)
- No file stored on server

### PDF Generation Code
```javascript
const puppeteer = require('puppeteer');

async function generateSlipPDF(order) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Generate HTML content
  const html = generateSlipHTML(order);
  await page.setContent(html);
  
  // Generate PDF
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  
  await browser.close();
  return pdf;
}
```

## Security Considerations

1. **Voter Data Encryption**: Encrypt voter data at rest
2. **JWT Authentication**: Secure API endpoints
3. **Payment Verification**: Verify Razorpay signatures
4. **Rate Limiting**: Prevent abuse
5. **HTTPS Only**: Force SSL in production
6. **CORS**: Restrict API access
7. **SQL Injection**: Use parameterized queries
8. **XSS Protection**: Sanitize user inputs

## Deployment Architecture

### Development
- Local: `http://localhost:3000`
- Database: Local MongoDB/PostgreSQL

### Production
- **Frontend**: Vercel/Netlify (static files)
- **Backend**: AWS EC2 / DigitalOcean / Heroku
- **Database**: MongoDB Atlas / AWS RDS
- **Storage**: None (on-demand generation)
- **CDN**: Cloudflare (for assets)

## Cost Structure

### Per User Calculation
```
Cost per voter information slip: ₹0.50
Platform fee: Included
Payment gateway fee: 2% (Razorpay)

Example:
- 500 voters = ₹250
- Gateway fee = ₹5
- Net revenue = ₹245
```

## Next Steps

1. ✅ Create landing page (Malayalam)
2. ✅ Implement user authentication (JWT)
3. ✅ Create dashboard UI
4. ✅ Build multi-step slip creation flow
5. ✅ Integrate Razorpay payment
6. ✅ Implement PDF generation (on-demand)
7. ✅ Add order management
8. ✅ Deploy to production

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB (recommended) or PostgreSQL
- **Authentication**: JWT (jsonwebtoken)
- **Payment**: Razorpay
- **PDF Generation**: Puppeteer
- **Browser Automation**: Playwright (existing)
- **Frontend**: HTML/CSS/JavaScript (Vanilla)
- **Styling**: Tailwind CSS (optional)

## Pricing Model

| Voters | Cost | 
|--------|------|
| 1-100  | ₹0.50/voter |
| 101-500 | ₹0.45/voter (10% discount) |
| 501-1000 | ₹0.40/voter (20% discount) |
| 1000+ | ₹0.35/voter (30% discount) |

## Features Roadmap

### Phase 1 (MVP)
- ✅ User authentication
- ✅ Basic slip generation
- ✅ Razorpay payment
- ✅ Dashboard with download

### Phase 2
- 🔄 Multi-party template library
- 🔄 Bulk order discount
- 🔄 Email notifications
- 🔄 SMS notifications

### Phase 3
- 🔄 Advanced customization (fonts, colors)
- 🔄 QR code on slips
- 🔄 Analytics dashboard
- 🔄 API for third-party integration
