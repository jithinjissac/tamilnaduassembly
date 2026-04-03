# PayUMoney Testing Guide

## Prerequisites

1. **PayUMoney Account**
   - Sign up at: https://www.payumoney.com/
   - Complete KYC verification
   - Get test credentials from dashboard

2. **Environment Setup**
   - Add credentials to `.env` file:
     ```bash
     PAYUMONEY_MERCHANT_KEY=your_test_merchant_key
     PAYUMONEY_MERCHANT_SALT=your_test_merchant_salt
     PAYUMONEY_ENV=test
     ```

## Admin Configuration

1. **Login to Admin Panel**
   - Navigate to: `https://yourdomain.com/admin-login.html`
   - Login with admin credentials

2. **Configure Payment Settings**
   - Go to Settings > Payment Settings
   - Select "PayUMoney" as active gateway
   - Enter Merchant Key
   - Enter Merchant Salt
   - Set Environment to "Test"
   - Click "Save Changes"

## Test Payment Flow

### Step 1: Create Order
1. Login as regular user
2. Fill voter extraction form
3. Extract voter data
4. Preview order
5. Click "Make Payment"

### Step 2: PayUMoney Redirect
- Browser will redirect to PayUMoney payment page
- URL should be: `https://test.payu.in/_payment`
- Form data should include:
  - `key`: Merchant key
  - `txnid`: Unique transaction ID
  - `amount`: Order amount
  - `productinfo`: Order description
  - `firstname`: User's first name
  - `email`: User's email
  - `phone`: User's phone
  - `surl`: Success URL
  - `furl`: Failure URL
  - `hash`: Payment hash (SHA-512)

### Step 3: Complete Payment
Use PayUMoney test credentials:
- **Test Card Number**: 5123 4567 8901 2346
- **CVV**: 123
- **Expiry**: Any future date
- **OTP**: 123456 (for test mode)

### Step 4: Verify Success Callback
After payment:
1. PayUMoney POSTs to: `/api/payment/payumoney/success`
2. Backend verifies hash
3. Order status updated to "completed"
4. Emails sent (payment success + PDF ready)
5. User redirected to: `/order-success.html?orderId=XXX`

## Test Failure Flow

### Intentional Failure
1. On PayUMoney page, click "Cancel" or "Back"
2. Should redirect to: `/api/payment/payumoney/failure`
3. Order status updated to "failed"
4. User redirected to: `/payment-failed.html`

## Verification Checklist

### Backend Logs
Check server logs for:
```
✅ PayUMoney order created: <orderId>
🚀 Submitting PayUMoney payment form...
✅ PayUMoney payment completed for order <orderId>
```

### Database Checks
Verify Order document:
```javascript
{
  paymentStatus: 'completed',
  payumoneyTxnId: 'ORD123_1234567890',
  payumoneyPaymentId: '123456789',
  paidAt: ISODate("2025-01-01T00:00:00.000Z")
}
```

### Email Verification
Check that emails were sent:
1. **Payment Success Email**
   - Subject: "Payment Successful - Order #XXX"
   - Contains order details
   - Payment ID included

2. **PDF Ready Email**
   - Subject: "Your Voter Information Slips are Ready"
   - Download link present
   - Order ID correct

### Frontend Checks
1. **Success Page** (`order-success.html`)
   - Order ID displayed
   - Download button visible
   - "View Orders" link working

2. **Dashboard** (`dashboard.html`)
   - Order appears in list
   - Payment status shows "Completed"
   - PayUMoney payment ID displayed
   - Download button enabled

## Common Issues

### Issue 1: Invalid Hash
**Symptoms**: Payment fails with "Invalid hash" error

**Solutions**:
- Verify merchant salt is correct
- Check hash generation order matches PayUMoney format
- Ensure no extra spaces in parameters

**Debug**:
```javascript
// In paymentController.js, add logging:
console.log('Hash string:', hashString);
console.log('Generated hash:', hash);
```

### Issue 2: Order Not Found
**Symptoms**: "Order not found" after payment success

**Solutions**:
- Verify `udf1` contains correct orderId
- Check database for order existence
- Ensure orderId format is correct

**Debug**:
```javascript
// In handlePayUMoneySuccess:
console.log('Payment response:', req.body);
console.log('Order ID from udf1:', req.body.udf1);
```

### Issue 3: Callback URL Not Working
**Symptoms**: Payment completes but no status update

**Solutions**:
- Verify callback URLs are publicly accessible
- Check PayUMoney merchant dashboard settings
- Ensure URLs use HTTPS in production
- Verify no firewall blocking

**Test Callback Manually**:
```bash
curl -X POST http://localhost:5000/api/payment/payumoney/success \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "key=TEST_KEY&txnid=TEST_TXN&amount=10.00&productinfo=Test&firstname=Test&email=test@test.com&mihpayid=123456&status=success&udf1=ORD123&hash=..."
```

### Issue 4: Hash Mismatch
**Symptoms**: "Hash verification failed" in logs

**Solutions**:
- Check merchant salt matches exactly
- Verify hash format includes all required fields
- Ensure field order matches PayUMoney spec
- Check for null/undefined values in response

**Hash Format Check**:
```
key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
```

## Testing Checklist

- [ ] Environment variables configured
- [ ] Admin settings saved
- [ ] Test payment initiated
- [ ] Redirected to PayUMoney
- [ ] Test payment completed
- [ ] Success callback received
- [ ] Hash verified successfully
- [ ] Order status updated
- [ ] Payment success email sent
- [ ] PDF ready email sent
- [ ] User redirected to success page
- [ ] Order visible in dashboard
- [ ] PDF downloadable
- [ ] Test failure flow
- [ ] Failure callback received
- [ ] Order status updated to failed
- [ ] User redirected to failure page

## Production Deployment

### Pre-Production
1. Test all flows in sandbox mode
2. Verify email delivery
3. Check PDF generation
4. Test download functionality

### Production Switch
1. Get production credentials from PayUMoney
2. Update `.env`:
   ```bash
   PAYUMONEY_MERCHANT_KEY=production_key
   PAYUMONEY_MERCHANT_SALT=production_salt
   PAYUMONEY_ENV=production
   ```
3. Update admin settings
4. Configure PayUMoney dashboard:
   - Success URL: `https://yourdomain.com/api/payment/payumoney/success`
   - Failure URL: `https://yourdomain.com/api/payment/payumoney/failure`

### Post-Production
1. Test with real card (small amount)
2. Verify settlement in merchant dashboard
3. Monitor logs for errors
4. Check email delivery
5. Verify PDF generation

## Support

### PayUMoney Support
- Dashboard: https://www.payumoney.com/merchant-dashboard/
- Documentation: https://docs.payu.in/
- Support Email: merchant.care@payu.in
- Phone: 0120-4604000

### Debugging Tools
- **Server Logs**: Check for PayUMoney-related errors
- **MongoDB**: Verify order updates
- **Email Logs**: Check nodemailer logs
- **Browser Console**: Check frontend errors
- **Network Tab**: Verify form submission

## Hash Calculation Example

```javascript
// Parameters
const params = {
  key: 'TEST_KEY',
  txnid: 'ORD123_1234567890',
  amount: '10.00',
  productinfo: 'Voter Information Slip Order - ORD123',
  firstname: 'John',
  email: 'john@example.com',
  udf1: 'ORD123',
  udf2: '',
  udf3: '',
  udf4: '',
  udf5: ''
};

// Salt
const salt = 'TEST_SALT';

// Hash string
const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${params.udf1}|${params.udf2}|${params.udf3}|${params.udf4}|${params.udf5}||||||${salt}`;

// Generate hash
const hash = crypto.createHash('sha512').update(hashString).digest('hex');

console.log('Hash:', hash);
```

## Success Response Example

```json
{
  "key": "TEST_KEY",
  "txnid": "ORD123_1234567890",
  "amount": "10.00",
  "productinfo": "Voter Information Slip Order - ORD123",
  "firstname": "John",
  "email": "john@example.com",
  "mihpayid": "403993715529816697",
  "status": "success",
  "hash": "...",
  "udf1": "ORD123",
  "mode": "CC",
  "bankcode": "CC",
  "cardnum": "512345XXXXXX2346"
}
```

---

**Last Updated**: 2025-01-29
**Status**: Ready for testing
