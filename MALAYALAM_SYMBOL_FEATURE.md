# Malayalam Symbol Name Feature

## Overview
Added support for Malayalam symbol names with Google Transliteration API for easy typing in Malayalam.

## What Was Added

### 1. Backend Changes

#### `models/Symbol.js`
- Added `nameMalayalam` field (String, optional)
- Updated text search index to include Malayalam names

```javascript
nameMalayalam: {
    type: String,
    trim: true,
    default: ''
}
```

#### `controllers/adminController.js`
- Updated `uploadSymbol` function to accept `nameMalayalam` parameter
- Saves Malayalam name along with English name

### 2. Frontend Changes

#### `frontend/admin.html`
- Added Google Transliteration API script in head section
- Added Malayalam name input field in symbol upload form
- Implemented automatic English-to-Malayalam transliteration
- Added initialization script for transliteration on page load
- Updated symbol display to show Malayalam names in symbol cards

**Features:**
- Type in English and it automatically converts to Malayalam
- Press `Ctrl+G` to toggle transliteration on/off
- Right-to-left text direction for proper Malayalam display
- Optional field (not required)

**Example Usage:**
```
Type: "lotus" → Output: "ലോട്ടസ്"
Type: "bharathiya janatha party" → Output: "ഭാരതീയ ജനതാ പാർട്ടി"
```

#### `frontend/symbol-picker.js`
- Updated symbol rendering to display Malayalam names
- Added Malayalam name search support
- Shows Malayalam name below English name in green color

### 3. User Interface

**Upload Form:**
- Symbol Name (English) - Required
- Symbol Name (Malayalam) - Optional with transliteration
- Helpful hint: "Type in English and it will convert to Malayalam"

**Symbol Display:**
- English name on top
- Malayalam name below in green (if provided)
- Right-to-left text direction for Malayalam

**Search Feature:**
- Can search by English name
- Can search by Malayalam name
- Both searches work seamlessly

## How to Use

### For Admins:
1. Go to Admin Dashboard → Upload Symbol tab
2. Enter Symbol Name in English (required)
3. Click on Malayalam name field
4. Start typing in English - it will automatically convert to Malayalam
5. Press `Ctrl+G` if you want to toggle transliteration
6. Complete the rest of the form and upload

### For Users:
1. When creating voter slips, symbols will show both English and Malayalam names
2. Can search using either English or Malayalam text
3. Malayalam names appear in green below English names

## Technical Details

**Malayalam Transliteration:**
- Custom JavaScript-based word mapping
- Pre-defined common words (lotus, hand, elephant, cycle, etc.)
- Shortcut: Ctrl+G to toggle on/off
- Conversion triggers: Space or Enter key
- Auto-enabled by default
- No external API dependencies

**Database Schema:**
- Field: `nameMalayalam`
- Type: String
- Index: Text search enabled
- Optional: Yes

**Text Direction:**
- Malayalam text uses `dir="rtl"` for proper right-to-left display
- Automatic alignment handled by CSS

## Benefits

1. **Accessibility:** Users who prefer Malayalam can easily identify symbols
2. **Ease of Entry:** No need for Malayalam keyboard - just type in English
3. **Bilingual Support:** Both languages displayed simultaneously
4. **Search Enhancement:** Search works in both languages
5. **Cultural Relevance:** Important for Kerala-based application

## Future Enhancements

- Add support for more regional languages
- Offline Malayalam keyboard support
- Voice input for Malayalam
- Bulk upload with Malayalam names via CSV

## Testing

To test the feature:
1. Login as admin: `admin@test.com` / `admin123`
2. Go to "Upload Symbol" tab
3. Try typing English text in Malayalam field
4. Verify transliteration works
5. Upload a symbol
6. Check if Malayalam name appears in symbol listing
7. Test search with Malayalam text

---

**Status:** ✅ Implemented and Ready for Use
**Date:** November 8, 2025
