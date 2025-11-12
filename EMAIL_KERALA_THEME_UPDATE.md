# Email Templates - Kerala Theme Update

## Changes Made

Updated all email templates with **Kerala traditional theme**, comprehensive order details, and real domain name (easlyslip.in).

## Kerala Theme Design

### Color Scheme
- **Green**: #006D3B (Kerala traditional green)
- **Gold**: #FFB81C (Kerala traditional gold)
- **Red**: #E03A3E (Kerala traditional red)
- **Cream**: #FFF8DC (Background cream)

### Design Elements
- **Border Pattern**: Tricolor stripe (Green, Gold, Red) at top and bottom
- **Header**: Kerala green background with white text
- **Body**: Clean white with Malayalam typography
- **Footer**: Cream background with Kerala branding
- **Button**: Green with gold border

## Updated Templates

### 1. Order Confirmation Email

**Subject**: 
```
Order Confirmed - {{wardName}} - {{orderId}}
```
Example: `Order Confirmed - 012 - കോട്ടയ്ക്കൽ - ORD-20251112-ABCD12`

**Heading**: 
```
Order Confirmed Successfully!
```

**Message**: 
```
നമസ്കാരം {{userName}},

Your order has been confirmed successfully!

📋 Order Details:
• Order ID: {{orderId}}
• Ward: {{wardName}}
• Polling Station: {{pollingStation}}
• Symbol: {{symbolName}}
• Total Voters: {{voterCount}}

Your voter slips are being prepared and will be ready for download shortly.
```

**Includes**:
- Malayalam greeting
- Order ID
- Ward name
- Polling station
- Symbol name
- Total voter count

### 2. Payment Success Email

**Subject**: 
```
Payment Successful - {{wardName}} - {{orderId}}
```
Example: `Payment Successful - 012 - കോട്ടയ്ക്കൽ - ORD-20251112-ABCD12`

**Heading**: 
```
Payment Received Successfully!
```

**Message**: 
```
നമസ്കാരം {{userName}},

Your payment has been received successfully!

💰 Payment Details:
• Amount Paid: ₹{{amount}}
• Order ID: {{orderId}}
• Ward: {{wardName}}

Your voter slips PDF is being generated and will be ready for download shortly.
```

**Includes**:
- Payment amount
- Order ID
- Ward name
- PDF generation status

### 3. PDF Ready Email

**Subject**: 
```
Your Voter Slips are Ready - {{wardName}} - {{orderId}}
```
Example: `Your Voter Slips are Ready - 012 - കോട്ടയ്ക്കൽ - ORD-20251112-ABCD12`

**Heading**: 
```
Your PDF is Ready for Download!
```

**Message**: 
```
നമസ്കാരം {{userName}},

Great news! Your voter slips PDF is now ready for download.

📄 PDF Details:
• Order ID: {{orderId}}
• Ward: {{wardName}}
• Polling Station: {{pollingStation}}
• Symbol: {{symbolName}}
• Total Voters: {{voterCount}}

Login to https://easlyslip.in to download your PDF.
```

**Includes**:
- Full order details
- Ward name
- Polling station
- Symbol name
- Total voters
- **Real domain**: https://easlyslip.in

## Available Placeholders (10 Total)

| Placeholder | Description | Example |
|------------|-------------|---------|
| `{{orderId}}` | Order ID | ORD-20251112-ABCD12 |
| `{{voterCount}}` | Number of voters | 1250 |
| `{{amount}}` | Payment amount | 2500 |
| `{{userName}}` | User's full name | രമേഷ് കുമാർ |
| `{{userEmail}}` | User's email | ramesh@example.com |
| `{{wardName}}` | Ward name | 012 - കോട്ടയ്ക്കൽ |
| `{{pollingStation}}` | Polling station | 001 - കോട്ടയ്ക്കൽ സർക്കാർ സ്കൂൾ |
| `{{symbolName}}` | Symbol name | രണ്ടില (Two Leaves) |
| `{{district}}` | District name | Kottayam / കോട്ടയം |
| `{{localBody}}` | Local body name | G05006-ഉദയനാപുരം |

## Email Preview Design

### Structure
```
┌────────────────────────────────────────┐
│ ▓▓▓ Kerala Border (Green/Gold/Red) ▓▓▓ │
├────────────────────────────────────────┤
│         [Kerala Green Header]          │
│           EaslySlip Logo               │
│         Email Heading Text             │
├────────────────────────────────────────┤
│                                        │
│        [White Background Body]         │
│                                        │
│  നമസ്കാരം User Name,                   │
│                                        │
│  Message with order details...         │
│                                        │
│  📋 Order Details:                     │
│  • Ward: ...                           │
│  • Polling Station: ...                │
│  • Symbol: ...                         │
│                                        │
│      [View Dashboard Button]           │
│     (Green with Gold border)           │
│                                        │
├────────────────────────────────────────┤
│ ▓▓▓ Kerala Border (Green/Gold/Red) ▓▓▓ │
├────────────────────────────────────────┤
│      [Cream Background Footer]         │
│   EaslySlip - Kerala Voter Service     │
│   🌐 https://easlyslip.in             │
│   © 2025 All rights reserved           │
├────────────────────────────────────────┤
│ ▓▓▓ Kerala Border (Green/Gold/Red) ▓▓▓ │
└────────────────────────────────────────┘
```

### Visual Elements

#### Kerala Border Pattern
```css
background: linear-gradient(
  to right, 
  #006D3B 0%, #006D3B 33.33%,     /* Green */
  #FFB81C 33.33%, #FFB81C 66.66%, /* Gold */
  #E03A3E 66.66%, #E03A3E 100%    /* Red */
);
```

#### Header
- **Background**: Kerala green (#006D3B)
- **Text**: White
- **Font**: Noto Sans Malayalam
- **Branding**: "EaslySlip" logo + heading

#### Body
- **Background**: White
- **Text**: Dark gray (#333)
- **Font**: Noto Sans Malayalam for Malayalam text
- **Line Height**: 1.8 (readable spacing)
- **Font Size**: 15px

#### Button
- **Background**: Kerala green
- **Border**: 2px solid Kerala gold
- **Text**: White
- **Padding**: 14px 35px
- **Border Radius**: 8px
- **Font Weight**: 600
- **Link**: https://easlyslip.in/dashboard.html

#### Footer
- **Background**: Cream (#FFF8DC)
- **Text**: Dark gray (#555)
- **Links**: Kerala green
- **Font Size**: 13px

## Sample Data for Preview

```javascript
const sampleOrder = {
  orderId: 'ORD-20251112-ABCD12',
  voterCount: 1250,
  amount: 2500,
  userName: 'രമേഷ് കുമാർ',
  userEmail: 'ramesh@example.com',
  wardName: '012 - കോട്ടയ്ക്കൽ',
  pollingStation: '001 - കോട്ടയ്ക്കൽ സർക്കാർ സ്കൂൾ',
  symbolName: 'രണ്ടില (Two Leaves)',
  district: 'Kottayam / കോട്ടയം',
  localBody: 'G05006-ഉദയനാപുരം'
};
```

## Live Preview Features

### Real-Time Updates
- Type in any field → Preview updates instantly
- All 10 placeholders are replaced with sample data
- Shows exact Kerala theme design
- Malayalam typography rendered correctly

### Preview Shows
1. **Kerala border pattern** (tricolor stripes)
2. **Green header** with EaslySlip branding
3. **Malayalam greeting** (നമസ്കാരം)
4. **Complete order details** with emojis
5. **Green button** with gold border
6. **Cream footer** with domain link
7. **Bottom border pattern**

## Typography

### Fonts Used
- **Malayalam**: Noto Sans Malayalam
- **English**: Arial, sans-serif
- **Fallback**: System fonts

### Font Sizes
- **Logo**: 28px
- **Heading**: 20px
- **Body**: 15px
- **Footer**: 13px

## Responsive Design

### Email Width
- **Max Width**: 600px
- **Centered**: Auto margins
- **Mobile**: Scales to fit screen

### Padding
- **Header**: 30px 20px
- **Body**: 40px 30px
- **Footer**: 25px 20px

## Domain Integration

### Real Domain Links
- **Website**: https://easlyslip.in
- **Dashboard**: https://easlyslip.in/dashboard.html
- **Button Text**: "View Dashboard" (instead of generic "View Order")

### Footer Links
- Active clickable link to easlyslip.in
- Kerala green color for links
- No underline, hover effect available

## Benefits

### Before
- ❌ Generic purple gradient design
- ❌ No ward name in subject
- ❌ Minimal order details
- ❌ No domain name
- ❌ Basic template

### After
- ✅ **Kerala traditional theme** (Green, Gold, Red)
- ✅ **Ward name in subject** for easy email filtering
- ✅ **Comprehensive details**: Ward, polling station, symbol, voters
- ✅ **Real domain**: https://easlyslip.in
- ✅ **Professional Kerala branding**
- ✅ **Malayalam typography** properly rendered
- ✅ **10 dynamic placeholders** for customization
- ✅ **Traditional border patterns**
- ✅ **Cream footer** matching Kerala aesthetic

## User Experience Improvements

### Email Organization
```
Before: "Order Confirmed - ORD-20251112-ABCD12"
After:  "Order Confirmed - 012 - കോട്ടയ്ക്കൽ - ORD-20251112-ABCD12"
```
- Users can **filter by ward** in email inbox
- **Malayalam ward names** for local recognition
- Easier to find specific orders

### Information Clarity
**Order Confirmation includes**:
- ✅ Order ID
- ✅ Ward name (with Malayalam)
- ✅ Full polling station name
- ✅ Symbol name (Malayalam + English)
- ✅ Total voter count

**PDF Ready includes**:
- ✅ All above details
- ✅ **Direct domain link**: https://easlyslip.in
- ✅ Clear download instructions

### Visual Identity
- Matches **contact page** Kerala theme
- Consistent with **landing page** design
- Professional **government-style** appearance
- Traditional **Kerala colors** (Green, Gold, Red)
- Clean, **readable typography**

## Testing

### Test in Admin Dashboard
1. Go to **"Email Settings"** tab
2. See **live preview** with Kerala theme
3. Edit any template
4. Watch preview update with:
   - Kerala border pattern
   - Green header
   - Malayalam text
   - Cream footer
   - Real domain link

### Preview Shows
- ✅ Exact Kerala colors
- ✅ Border patterns (top and bottom)
- ✅ Malayalam rendering
- ✅ All 10 placeholders replaced
- ✅ Button with gold border
- ✅ easlyslip.in domain

## Files Modified

- **frontend/admin.html**: Email templates and preview JavaScript

## Conclusion

Email templates now feature:
1. **Kerala traditional theme** matching website design
2. **Ward name in subject** for better organization
3. **Comprehensive order details** in body
4. **Real domain name** (easlyslip.in) in PDF ready email
5. **10 dynamic placeholders** for full customization
6. **Professional design** with border patterns and branding
7. **Malayalam typography** properly rendered
8. **Live preview** showing exact design

The emails now match the website's Kerala aesthetic while providing users with all the information they need about their orders.
