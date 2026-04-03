# Unified Settings Page - Complete Implementation

## Overview

Created a modern, unified settings page (`settings.html`) that combines both **Slip Font Settings** and **Email Settings** with a tabbed interface and live preview functionality.

## What Changed

### New File Created
- **`frontend/settings.html`** - Unified settings page with tabs and previews

### Files Modified
- **`frontend/admin.html`** - Replaced separate "Slip Settings" and "Email Settings" buttons with single "Settings" button

## Features

### 1. Tabbed Interface
- **Clean navigation** similar to the admin dashboard
- Two main tabs:
  - **Slip Font Settings** - Configure font sizes for voter information slips
  - **Email Settings** - Customize email templates

### 2. Live Preview Panel (Slip Settings)
- **Real-time updates** as you adjust font sizes
- **Sample voter data** showing realistic Malayalam content:
  - Name: രമേഷ് കുമാർ
  - House: ശ്രീ നിലയം (12/345)
  - Guardian: സുരേഷ് കുമാർ
  - Ward: 012 - കോട്ടയ്ക്കൽ
  - Polling Station: 001 - കോട്ടയ്ക്കൽ സർക്കാർ സ്കൂൾ
  - Symbol: രണ്ടില (Two Leaves)

- **Visual representation** of actual slip layout:
  - Symbol on left side
  - Voter details on right
  - Ward above serial number
  - Proper Malayalam typography

### 3. Live Email Preview
- **Template visualization** with sample data
- Shows how emails will look to users
- Includes:
  - Header with branding
  - Dynamic message content
  - Action button
  - Footer information

### 4. Responsive Design
- **Two-column layout** on large screens (settings + preview)
- **Single column** on smaller screens
- **Sticky preview panel** that follows while scrolling
- **Mobile-friendly** interface

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│                      Header                              │
│   Settings                            [Back to Admin]    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  [Slip Font Settings] │ [Email Settings]                │
├─────────────────────────┬───────────────────────────────┤
│                         │                               │
│  Settings Form          │    Live Preview Panel         │
│                         │                               │
│  • Font Size Inputs     │    ┌────────────────────┐    │
│  • 5 Slips Per Page     │    │  Preview Content   │    │
│  • 6 Slips Per Page     │    │  with Sample Data  │    │
│                         │    └────────────────────┘    │
│  [Save]  [Reset]        │                               │
└─────────────────────────┴───────────────────────────────┘
```

## Slip Font Settings

### 5 Slips Per Page (Default)
- Symbol Header: 8pt
- Symbol Image: 24mm
- Symbol Name: 9.5pt
- Slip Number: 11pt
- SEC ID: 10pt
- Voter Name: 11pt
- Info Row: 10pt
- Info Label: 17mm
- Polling Station: 10pt

### 6 Slips Per Page (Compact)
- Symbol Header: 7pt
- Symbol Image: 20mm
- Symbol Name: 8.5pt
- Slip Number: 10pt
- SEC ID: 9pt
- Voter Name: 11pt
- Info Row: 9pt
- Info Label: 16mm
- Polling Station: 9pt

## Email Settings

### Three Template Types

#### 1. Order Confirmation Email
- **Subject**: "Order Confirmed - {{orderId}}"
- **Heading**: "Order Confirmed!"
- **Message**: Thank you message with order details
- **Placeholders**: {{orderId}}, {{voterCount}}

#### 2. Payment Success Email
- **Subject**: "Payment Successful - {{orderId}}"
- **Heading**: "Payment Successful!"
- **Message**: Payment confirmation with amount
- **Placeholders**: {{orderId}}, {{amount}}

#### 3. PDF Ready Email
- **Subject**: "Your Voter Information Slips are Ready - {{orderId}}"
- **Heading**: "Your PDF is Ready!"
- **Message**: Download notification
- **Placeholders**: {{orderId}}, {{voterCount}}

### Available Placeholders
- `{{orderId}}` - Order ID (e.g., ORD-20251112-ABCD12)
- `{{voterCount}}` - Number of voters
- `{{amount}}` - Payment amount

## How to Use

### Accessing Settings
1. Go to Admin Dashboard
2. Click the **Settings** button in the top navigation
3. Select the tab you want to configure

### Adjusting Slip Fonts
1. Switch to **Slip Font Settings** tab
2. Modify any font size value
3. Watch the **live preview** update automatically
4. Click **Save Settings** when satisfied
5. Click **Reset to Defaults** to restore original values

### Customizing Emails
1. Switch to **Email Settings** tab
2. Edit subject, heading, or message for any template
3. Use placeholders like {{orderId}} for dynamic content
4. Preview updates show sample data
5. Click **Save Settings** to apply changes

## Technical Implementation

### Real-Time Preview Updates
```javascript
// Slip preview updates on input change
document.querySelectorAll('.slip-input').forEach(input => {
    input.addEventListener('input', updateSlipPreview);
});

// Generates preview HTML with current font settings
function updateSlipPreview() {
    // Reads form values
    // Applies to sample voter data
    // Updates preview container
}
```

### Sample Data
```javascript
const sampleVoter = {
    sl_no: '123',
    name: 'രമേഷ് കുമാർ',
    guardian_name: 'സുരേഷ് കുമാർ',
    house_no: '12/345',
    house_name: 'ശ്രീ നിലയം',
    gender_age: 'M / 45',
    sec_id: 'SEC123456789'
};

const sampleOrder = {
    orderId: 'ORD-20251112-ABCD12',
    voterCount: 1250,
    amount: 2500
};
```

### API Integration
- **GET /api/settings/slip** - Load current slip settings
- **PUT /api/settings/slip** - Save slip settings
- **GET /api/settings/email** - Load email templates
- **PUT /api/settings/email** - Save email templates

### Authentication
- Uses JWT token from localStorage
- Redirects to login if not authenticated
- Saves redirect URL for post-login return

## Design Features

### Color Scheme
- **Primary**: #667eea (Purple Blue)
- **Accent**: #764ba2 (Purple)
- **Background**: White panels on gradient
- **Text**: #333 for headers, #555 for labels

### Typography
- **Interface**: Inter font family
- **Malayalam**: Noto Sans Malayalam
- **Font Weights**: 300, 400, 500, 600, 700

### UI Elements
- **Panels**: White cards with shadows
- **Inputs**: Rounded corners with focus states
- **Buttons**: Primary (purple) and Secondary (gray)
- **Alerts**: Success (green) and Error (red)
- **Loading**: Spinner with animation

### Responsive Breakpoints
- **Large screens** (>1400px): Two-column layout
- **Medium screens** (<1400px): Single column
- **Small screens**: Optimized for mobile

## User Experience Improvements

### Before
- ❌ Separate pages for slip and email settings
- ❌ No visual feedback when changing settings
- ❌ Trial and error to see font size effects
- ❌ Different navigation patterns

### After
- ✅ Unified interface with tabs
- ✅ **Live preview** with real-time updates
- ✅ **Sample data** showing realistic output
- ✅ Consistent design matching admin dashboard
- ✅ **Sticky preview panel** always visible
- ✅ Immediate visual feedback
- ✅ Better organization and discoverability

## Benefits

1. **Time Savings**: See changes instantly without generating PDFs
2. **Better UX**: Clear visual feedback reduces guesswork
3. **Consistency**: Matches admin dashboard design patterns
4. **Organization**: All settings in one place
5. **Mobile Friendly**: Works on all screen sizes
6. **Professional**: Modern tabbed interface
7. **Accessibility**: Clear labels and visual hierarchy

## Navigation Flow

```
Admin Dashboard
    ↓
[Settings Button]
    ↓
Settings Page (Tabbed)
    ├── Slip Font Settings → Live Preview
    └── Email Settings → Email Preview
```

## Future Enhancements (Optional)

- Add more template types
- Allow custom CSS for emails
- Export/import settings
- Version history
- Multiple preview layouts
- Dark mode support
- Settings comparison tool

## Testing Guide

### Test Slip Settings
1. Change "Voter Name" font size to 15pt
2. Verify preview updates immediately
3. Change "Symbol Image" to 30mm
4. Verify symbol size increases in preview
5. Click Save and verify success message

### Test Email Settings
1. Edit "Order Confirmation" heading
2. Add custom message with placeholders
3. Verify preview shows sample data correctly
4. Click Save and verify success message

### Test Responsiveness
1. Resize browser window
2. Verify layout switches to single column
3. Test on mobile device
4. Verify all controls are accessible

## File Locations

- **Frontend**: `frontend/settings.html`
- **Admin Link**: `frontend/admin.html` (line 614)
- **API Routes**: Backend `/api/settings/slip` and `/api/settings/email`

## Conclusion

The unified settings page provides a modern, user-friendly interface for managing both slip and email configurations with the added benefit of **live previews** that dramatically improve the user experience. The tabbed design matches the admin dashboard while the real-time feedback helps users make informed decisions about their settings.
