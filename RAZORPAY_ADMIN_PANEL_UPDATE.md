# Razorpay Admin Panel Integration - Update Complete ✅

## What Changed?

Razorpay payment gateway has been updated to use **Admin Panel Settings** instead of only `.env` file, making it consistent with Cashfree implementation.

## Before vs After

### ❌ BEFORE (Old Implementation)
```javascript
// config/razorpay.js - Hardcoded to .env only
razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// paymentController.js - Direct .env access
key: process.env.RAZORPAY_KEY_ID
```

**Problem:** Admin panel settings were ignored. Even if admin updated Razorpay credentials in the UI, the backend still used `.env` values.

### ✅ AFTER (New Implementation)
```javascript
// config/razorpay.js - Dynamic initialization
export async function initializeRazorpay(keyId, keySecret) {
    razorpayInstance = new Razorpay({
        key_id: keyId || process.env.RAZORPAY_KEY_ID,
        key_secret: keySecret || process.env.RAZORPAY_KEY_SECRET
    });
}

// paymentController.js - Admin settings first
const paymentSettings = await Settings.getSettings('payment');
const razorpayKeyId = paymentSettings?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
await initializeRazorpay(razorpayKeyId, razorpayKeySecret);
```

**Solution:** Admin panel settings take priority, with `.env` as fallback. Both gateways now work identically.

---

## Files Modified

### 1. **config/razorpay.js**
**Changes:**
- Added `initializeRazorpay(keyId, keySecret)` function for dynamic initialization
- Added `getRazorpayInstance()` getter function
- Supports reinitializing with different credentials at runtime
- Falls back to `.env` if no parameters provided

**New Functions:**
```javascript
export async function initializeRazorpay(keyId = null, keySecret = null)
export function getRazorpayInstance()
```

### 2. **controllers/paymentController.js**
**Changes in 4 functions:**

#### a) `createRazorpayOrder()`
- Fetches Razorpay credentials from admin settings
- Reinitializes Razorpay SDK with current credentials
- Uses admin panel Key ID in response
- Validates credentials before processing

#### b) `verifyPayment()`
- Gets Key Secret from admin settings for signature verification
- Uses `paymentSettings?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET`
- Ensures verification uses same credentials as order creation

#### c) `webhook()`
- Gets Webhook Secret from admin settings
- Uses `paymentSettings?.razorpay?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET`
- Validates webhook signature with current settings

#### d) **Imports Updated**
```javascript
// Added new imports
import { initializeRazorpay, getRazorpayInstance } from '../config/razorpay.js';
```

---

## Settings Priority

Both payment gateways now follow the same priority:

1. **Admin Panel Settings** (from MongoDB `Settings` collection)
2. **Environment Variables** (`.env` file)
3. **Validation** (reject placeholder values like `your_key_id` or `xxxxx`)

```javascript
// Priority pattern used everywhere
const razorpayKeyId = paymentSettings?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
const cashfreeAppId = paymentSettings?.cashfree?.appId || process.env.CASHFREE_APP_ID;
```

---

## Testing the Update

### Test 1: Admin Panel Override
1. Go to **Admin Panel → Payment Gateway**
2. Update Razorpay credentials (different from `.env`)
3. Click **Save Settings**
4. Create a test order
5. Check browser console for Razorpay Key ID
6. **Expected:** Should see the admin panel Key ID, not `.env` value

### Test 2: Fallback to .env
1. Go to **Admin Panel → Payment Gateway**
2. Clear all Razorpay fields
3. Click **Save Settings**
4. Create a test order
5. **Expected:** Should use `.env` credentials as fallback

### Test 3: Switch Between Gateways
1. Go to **Admin Panel → Payment Gateway**
2. Click **Razorpay** card to activate
3. Save settings
4. Create test order → Should use Razorpay
5. Go back to admin panel
6. Click **Cashfree** card to activate
7. Create another test order → Should use Cashfree

### Test 4: Webhook Verification
1. Set up Razorpay webhook in dashboard
2. Update webhook secret in admin panel
3. Make a test payment
4. Check server logs for webhook verification
5. **Expected:** Should verify using admin panel webhook secret

---

## API Behavior

### `POST /api/payment/razorpay/create-order`
**Request:**
```json
{
  "orderId": "ORD-1234567890"
}
```

**Response (Admin Settings Used):**
```json
{
  "status": "success",
  "gateway": "razorpay",
  "razorpayOrder": {
    "id": "order_ABC123",
    "amount": 10000,
    "currency": "INR"
  },
  "orderId": "ORD-1234567890",
  "key": "rzp_test_ADMIN_PANEL_KEY"  // ← From admin settings
}
```

### `POST /api/payment/verify`
**Request:**
```json
{
  "razorpay_order_id": "order_ABC123",
  "razorpay_payment_id": "pay_XYZ789",
  "razorpay_signature": "abc123...",
  "orderId": "ORD-1234567890"
}
```

**Behavior:**
- Uses admin panel `keySecret` for signature verification
- Falls back to `.env` if admin settings empty

### `POST /api/payment/webhook`
**Behavior:**
- Webhook signature verified using admin panel `webhookSecret`
- Falls back to `RAZORPAY_WEBHOOK_SECRET` from `.env`

---

## Admin Panel UI

The admin panel already supported Razorpay configuration:

**Location:** `frontend/payment-settings.html`

**Razorpay Fields:**
- ✅ Key ID
- ✅ Key Secret  
- ✅ Webhook Secret
- ✅ Enable/Disable toggle

**Previously:** These settings were saved but NOT used by backend.

**Now:** These settings are actively used for all Razorpay operations.

---

## Configuration Examples

### Option 1: Use Admin Panel Only
```env
# .env - No Razorpay credentials
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

**Admin Panel Settings:**
```javascript
{
  payment: {
    activeGateway: 'razorpay',
    razorpay: {
      enabled: true,
      keyId: 'rzp_test_REAL_KEY',
      keySecret: 'REAL_SECRET',
      webhookSecret: 'REAL_WEBHOOK_SECRET'
    }
  }
}
```

**Result:** ✅ Uses admin panel credentials

---

### Option 2: Use .env as Fallback
```env
# .env - Fallback credentials
RAZORPAY_KEY_ID=rzp_test_ENV_KEY
RAZORPAY_KEY_SECRET=ENV_SECRET
RAZORPAY_WEBHOOK_SECRET=ENV_WEBHOOK
```

**Admin Panel Settings:**
```javascript
{
  payment: {
    razorpay: {
      enabled: true,
      keyId: '',  // Empty
      keySecret: '',
      webhookSecret: ''
    }
  }
}
```

**Result:** ✅ Uses `.env` credentials

---

### Option 3: Hybrid (Recommended)
```env
# .env - Development/Test credentials
RAZORPAY_KEY_ID=rzp_test_DEV_KEY
RAZORPAY_KEY_SECRET=DEV_SECRET
```

**Admin Panel Settings:**
```javascript
{
  payment: {
    razorpay: {
      enabled: true,
      keyId: 'rzp_live_PRODUCTION_KEY',  // Production
      keySecret: 'PRODUCTION_SECRET',
      webhookSecret: 'PRODUCTION_WEBHOOK'
    }
  }
}
```

**Result:** ✅ Uses production credentials from admin panel, falls back to test credentials if needed

---

## Benefits of This Update

### 1. **Consistency** ✅
Both Razorpay and Cashfree now use the same configuration pattern.

### 2. **Flexibility** ✅
Admin can change credentials without editing `.env` or restarting server.

### 3. **Multi-Environment Support** ✅
- Keep test credentials in `.env`
- Use production credentials in admin panel
- Switch easily between environments

### 4. **Runtime Updates** ✅
Credentials are reloaded on each payment request, no server restart needed.

### 5. **Better UX** ✅
Admin panel settings actually work now (previously they were ignored).

---

## Migration Guide

### If You're Using .env Only
**No action needed!** Your existing `.env` credentials will continue to work as fallback.

### If You Have Admin Panel Settings
**Good news!** They will now be used automatically. Test your payments to confirm.

### Recommended Migration Steps

1. **Backup current .env:**
   ```bash
   cp .env .env.backup
   ```

2. **Login to admin panel:**
   - Go to Payment Gateway settings
   - Enter your Razorpay credentials
   - Save settings

3. **Test payment flow:**
   - Create test order
   - Complete payment
   - Verify order status

4. **Optional - Clean .env:**
   ```env
   # Keep as fallback or remove if using admin panel only
   RAZORPAY_KEY_ID=
   RAZORPAY_KEY_SECRET=
   ```

---

## Troubleshooting

### Issue: "Razorpay not configured"
**Cause:** No credentials found in admin panel OR `.env`

**Solution:**
1. Check admin panel settings
2. Verify `.env` has valid credentials
3. Restart server if needed

### Issue: Wrong credentials being used
**Cause:** Admin settings empty, falling back to `.env`

**Solution:**
1. Go to admin panel
2. Fill in Razorpay credentials
3. Save settings
4. Create new order to test

### Issue: Signature verification failed
**Cause:** Key Secret mismatch between order creation and verification

**Solution:**
1. Ensure admin panel has same Key Secret used for order
2. Check if `.env` was changed after order creation
3. Use consistent credentials source

---

## Code Examples

### Dynamic Initialization Pattern
```javascript
// Get settings (admin panel or .env)
const paymentSettings = await Settings.getSettings('payment');
const keyId = paymentSettings?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
const keySecret = paymentSettings?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;

// Validate credentials
if (!keyId || keyId.includes('your_') || keyId.includes('xxxxx')) {
    throw new Error('Invalid credentials');
}

// Initialize with current credentials
await initializeRazorpay(keyId, keySecret);
const razorpayClient = getRazorpayInstance();

// Use client for operations
const order = await razorpayClient.orders.create({...});
```

### Settings Fallback Pattern
```javascript
// Used in all payment functions
const razorpayKeyId = paymentSettings?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = paymentSettings?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = paymentSettings?.razorpay?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
```

---

## Summary

| Feature | Before | After |
|---------|--------|-------|
| Configuration Source | `.env` only | Admin Panel → `.env` |
| Runtime Updates | ❌ Requires restart | ✅ Dynamic reload |
| Admin Panel UI | ✅ Exists | ✅ Actually works |
| Consistency with Cashfree | ❌ Different | ✅ Same pattern |
| Flexibility | ❌ Limited | ✅ High |
| Fallback Support | N/A | ✅ Yes |

---

## Next Steps

1. ✅ **Test the update** - Create test payments with admin panel credentials
2. ✅ **Update production settings** - Add production credentials via admin panel
3. ✅ **Monitor logs** - Check for initialization messages
4. ✅ **Document for team** - Share this guide with team members
5. ✅ **Commit changes** - Push to GitHub

---

**Status:** ✅ **COMPLETE**

Both Razorpay and Cashfree now support admin panel configuration with `.env` fallback!
