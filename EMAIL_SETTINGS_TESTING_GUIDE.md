# 🧪 Email Settings Testing Guide

## Quick Test Steps

### **Step 1: Access Admin Dashboard**
1. Open browser: `http://localhost:3000/admin.html`
2. Login with admin credentials:
   - Email: `admin@test.com`
   - Password: `admin123`

---

### **Step 2: Navigate to Email Settings**
1. Click on **"📧 Email Settings"** tab in the admin dashboard
2. You should see the split-screen email settings page:
   - Left: Settings form
   - Right: Template preview

---

### **Step 3: Configure SMTP (Gmail Example)**
1. Fill in the SMTP configuration:
   ```
   SMTP Host: smtp.gmail.com
   SMTP Port: 587
   SMTP Username: your-email@gmail.com
   SMTP Password: your-app-password
   From Email: noreply@yourapp.com
   From Name: Kerala Voter Slips
   ```

2. **Get Gmail App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Generate new app password for "Mail"
   - Use this password (not your regular Gmail password)

3. Enable templates:
   - ✅ Enable Order Confirmation Emails
   - ✅ Enable Payment Success Emails  
   - ✅ Enable PDF Ready Emails

4. Click **"💾 Save Settings"**

---

### **Step 4: Test Email Sending**
1. In the "Test Email Configuration" section
2. Enter your test email address
3. Click **"📧 Send Test Email"**
4. Check your inbox for the test email
5. Should receive "Order Confirmation" email with sample data

---

### **Step 5: Preview Email Templates**
1. Click each template button:
   - **Order Confirmation**
   - **Payment Success**
   - **PDF Ready**

2. See live preview in the right panel
3. Templates show with sample data

**What to check:**
- ✅ Professional gradient header
- ✅ Order details table
- ✅ Buttons styled correctly
- ✅ Malayalam text displays properly
- ✅ Responsive layout

---

### **Step 6: Test Real Email Flow**

#### **A. Order Confirmation Email**
1. Go to: `http://localhost:3000/create-slip.html`
2. Create a new order:
   - Select district, local body, ward, polling station
   - Add symbol and customization
   - Submit order
3. Check email inbox for **Order Confirmation** email

#### **B. Payment Success Email**
1. Complete payment for an order (or use admin "Generate Slip" button)
2. Check email for **Payment Success** email

#### **C. PDF Ready Email**
1. Wait for PDF generation to complete
2. Check email for **PDF Ready** email with download link

---

## 🔍 Verification Checklist

### **Settings Page**
- [ ] Email Settings page loads without errors
- [ ] Split-screen layout displays correctly
- [ ] Settings form has all SMTP fields
- [ ] Template toggle switches work
- [ ] Save button functional

### **Template Preview**
- [ ] Preview iframe loads
- [ ] "Order Confirmation" template displays
- [ ] "Payment Success" template displays
- [ ] "PDF Ready" template displays
- [ ] Sample data shows correctly

### **Test Email**
- [ ] Test email input accepts email address
- [ ] Send button shows loading state
- [ ] Success message appears
- [ ] Email received in inbox
- [ ] Email template renders correctly

### **SMTP Configuration**
- [ ] Settings save to database
- [ ] Settings persist after page reload
- [ ] Invalid SMTP shows error message
- [ ] Valid SMTP allows email sending

### **Real Email Flow**
- [ ] Order creation triggers email (if enabled)
- [ ] Payment success triggers email (if enabled)
- [ ] PDF ready triggers email (if enabled)
- [ ] Emails contain correct order data
- [ ] Links in emails work correctly

---

## 🚨 Common Issues & Solutions

### **Issue: Test email not sending**
**Solutions:**
1. Check SMTP credentials are correct
2. Use Gmail App Password, not regular password
3. Enable "Allow less secure apps" (for some providers)
4. Check port 587 is not blocked by firewall
5. Verify internet connection

### **Issue: Template preview not loading**
**Solutions:**
1. Check browser console for errors
2. Verify admin authentication token is valid
3. Check server logs for route errors
4. Try refreshing the page

### **Issue: Settings not saving**
**Solutions:**
1. Verify MongoDB is connected (check server logs)
2. Ensure admin role is set (`role: 'admin'`)
3. Check browser network tab for API errors
4. Verify JWT token in localStorage

### **Issue: Gmail SMTP errors**
**Solutions:**
1. **"Less secure apps"**: Use App Password instead
2. **"Authentication failed"**: Regenerate App Password
3. **"Connection timeout"**: Check firewall settings
4. **"Invalid credentials"**: Verify username is full email

---

## 📊 Testing with Different SMTP Providers

### **1. Gmail**
```
Host: smtp.gmail.com
Port: 587
Username: your-email@gmail.com
Password: [App Password]
```
✅ **Recommended for testing**

### **2. Outlook/Hotmail**
```
Host: smtp-mail.outlook.com
Port: 587
Username: your-email@outlook.com
Password: [Your Password]
```

### **3. SendGrid (Production)**
```
Host: smtp.sendgrid.net
Port: 587
Username: apikey
Password: [SendGrid API Key]
```
✅ **Recommended for production**

### **4. Mailtrap (Testing)**
```
Host: smtp.mailtrap.io
Port: 2525
Username: [Mailtrap Username]
Password: [Mailtrap Password]
```
✅ **Perfect for development - emails don't actually send**

---

## 🎯 API Testing (Optional)

### **Get Email Settings**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/settings/email
```

### **Update Settings**
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "smtpUsername": "test@gmail.com",
    "smtpPassword": "app-password",
    "fromEmail": "noreply@app.com",
    "fromName": "Kerala Voter Slips"
  }' \
  http://localhost:3000/api/settings/email
```

### **Send Test Email**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your@email.com"}' \
  http://localhost:3000/api/settings/test-email
```

### **Preview Template**
```bash
# Open in browser
http://localhost:3000/api/settings/preview-template/orderConfirmation
http://localhost:3000/api/settings/preview-template/paymentSuccess
http://localhost:3000/api/settings/preview-template/pdfReady
```

---

## 📝 Expected Results

### **Successful Test Email:**
```
Subject: Test Email - Kerala Voter Slips
From: Kerala Voter Slips <noreply@app.com>
To: your@email.com

Content: Order Confirmation email with sample data
- Order ID: ORD-20251110-SAMPLE
- 1421 voters
- Location details in Malayalam
- Professional styling
```

### **Successful Settings Save:**
```
✅ Settings updated successfully!
```

### **Successful Template Preview:**
```
Full HTML email template displayed in iframe
- Gradient header
- Order details table
- Action buttons
- Footer with branding
```

---

## 🎨 Visual Inspection Points

When previewing templates, check:

1. **Header**
   - Gradient background (purple/blue)
   - Large emoji icon
   - White text, centered

2. **Content**
   - Clean white background
   - Readable font size
   - Proper spacing

3. **Order Details Box**
   - Gray background
   - Border styling
   - Two-column layout (label | value)

4. **Buttons**
   - Colored background
   - White text
   - Rounded corners
   - Hover effects

5. **Footer**
   - Small gray text
   - Company branding
   - Centered alignment

6. **Malayalam Text**
   - Displays correctly (not boxes/gibberish)
   - Proper direction (RTL if needed)
   - Readable font

---

## ✅ Success Criteria

**Email settings implementation is successful if:**

1. ✅ Admin can access email settings page
2. ✅ SMTP configuration can be saved
3. ✅ Test email sends successfully
4. ✅ All 3 template previews load correctly
5. ✅ Templates display with proper styling
6. ✅ Order creation triggers email (when enabled)
7. ✅ Payment success triggers email (when enabled)
8. ✅ PDF ready triggers email (when enabled)
9. ✅ Settings persist after server restart
10. ✅ No console errors or API failures

---

## 📚 Next Steps After Testing

Once testing is complete:

1. **Production SMTP:** Configure production email service (SendGrid, AWS SES, etc.)
2. **Email Templates:** Customize templates with your branding
3. **Error Monitoring:** Set up logging for email failures
4. **Email Analytics:** Track email open/click rates (optional)
5. **Template Customization:** Add more variables/personalization

---

**Happy Testing! 🎉**

If you encounter any issues, check:
1. Server logs (`npm start` terminal output)
2. Browser console (F12)
3. MongoDB connection status
4. SMTP provider documentation
