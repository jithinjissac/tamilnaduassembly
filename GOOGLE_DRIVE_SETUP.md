# 🚀 Google Drive Integration Setup Guide

This guide explains how to set up Google Drive integration for automatic PDF uploads using **OAuth 2.0** (works with personal Google Drive accounts).

---

## 📋 Overview

The system automatically uploads generated voter slip PDFs to Google Drive, providing:
- **Shareable links** for easy access from in-app browsers (Instagram, Facebook, etc.)
- **Cloud backup** of all generated PDFs
- **Alternative download method** when direct downloads fail
- **Works with personal Google Drive** (no need for Google Workspace)

---

## 🔧 Quick Setup (OAuth 2.0)

### **Step 1: Create OAuth 2.0 Credentials**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Go to **"APIs & Services"** → **"Credentials"**
4. Click **"+ CREATE CREDENTIALS"** → **"OAuth 2.0 Client ID"**
5. If prompted, configure the OAuth consent screen:
   - User type: **"External"**
   - App name: `Voter Slips App`
   - User support email: Your email
   - Developer contact: Your email
   - Click **"Save and Continue"** through all steps
6. Application type: Select **"Desktop app"** or **"Web application"**
7. Name: `Voter Slips Uploader`
8. Click **"Create"**
9. **Download the JSON** or copy the **Client ID** and **Client Secret**

---

### **Step 2: Get Refresh Token**

Run the setup script:

```bash
node setup-google-drive-oauth.js
```

Follow the prompts:
1. Enter your **Client ID**
2. Enter your **Client Secret**
3. Open the URL shown in your browser
4. **Sign in** with your Google account
5. **Allow** the app to access your Google Drive
6. Copy the **authorization code** from the browser
7. Paste it into the terminal

The script will output your configuration. Copy it!

---

### **Step 3: Create Google Drive Folder**

1. Go to [Google Drive](https://drive.google.com)
2. Create a folder: `Voter Slips`
3. Open the folder and copy the **Folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/1abc123xyz456...
                                           ↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                           Copy this ID
   ```

---

### **Step 4: Update .env File**

Add these to your `.env`:

```env
# Google Drive OAuth2 Configuration
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_DRIVE_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxxx
GOOGLE_DRIVE_FOLDER_ID=1abc123xyz456...
```

---

## ✅ Verification

### **Test the Setup**

1. **Run the test script** (recommended before first use):
   ```bash
   node test-google-drive.js
   ```
   
   **Expected output:**
   ```
   ✅ Google Drive authentication successful
   ✅ Google Drive client initialized
   ✅ Google Drive connection successful! Folder: "Voter Slips"
   ✅ All tests passed! Google Drive is configured correctly.
   ```
   
   **If you see errors**, check the troubleshooting section below.

2. Restart your server:
   ```bash
   npm start
   ```

3. Look for these log messages on startup:
   ```
   🔑 Initializing Google Drive with:
      - Email: voter-slips-uploader@...
      - Key length: 1704
   🔐 Authorizing JWT client...
   ✅ Google Drive authentication successful
   ✅ Google Drive client initialized
   ```

4. Generate a voter slip PDF (create an order and complete payment)

5. Check the logs for:
   ```
   📤 Uploading ORD-xxx to Google Drive...
   ✅ Uploaded to Google Drive: https://drive.google.com/...
   ```

6. Check your Google Drive folder - the PDF should appear!

---

## 🔍 Troubleshooting

### **Error: "Google Drive client not available"**
- ✅ Check that all 3 environment variables are set in `.env`
- ✅ Restart the server after updating `.env`

### **Error: "Permission denied"**
- ✅ Make sure you shared the folder with the service account email
- ✅ Grant **"Editor"** permission, not just "Viewer"

### **Error: "File not found" or "Folder not found"**
- ✅ **This is the most common error!**
- ✅ The folder ID is correct, but the service account doesn't have access
- ✅ Go to Google Drive → Right-click the folder → Share
- ✅ Add: `voter-slips-uploader@coastal-case-479317-v6.iam.gserviceaccount.com`
- ✅ Give it **"Editor"** permission
- ✅ Make sure you clicked "Share" to save the changes
- ✅ Wait 1-2 minutes for permissions to propagate
- ✅ Run `node test-google-drive.js` again to verify

### **Error: "Invalid credentials"**
- ✅ Check that `GOOGLE_DRIVE_PRIVATE_KEY` includes the full key with newlines
- ✅ Make sure it's wrapped in double quotes
- ✅ Don't escape the `\n` characters (keep them as `\n`, not `\\n`)

### **Files not appearing in Drive folder**
- ✅ Check that `GOOGLE_DRIVE_FOLDER_ID` is correct
- ✅ Open the folder in Drive and verify the service account has access
- ✅ Run `node test-google-drive.js` to test folder access
- ✅ Check server logs for upload errors
- ✅ Verify the service account email is listed in "People with access" for the folder

---

## 📊 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User completes payment                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PDF generated locally                                    │
│    → Saved to: public/permanent-pdfs/{orderId}.pdf         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Uploaded to Google Drive                                 │
│    → Folder: "Voter Slips"                                  │
│    → Filename: {orderId}-voter-slips.pdf                    │
│    → Permission: Public (anyone with link can view)         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Shareable link stored                                    │
│    → Database: order.googleDriveLink                        │
│    → In-memory: pdfJobs.googleDriveLink                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Frontend shows Google Drive button                       │
│    → Visible when: googleDriveAvailable === true            │
│    → User clicks → Opens in new tab                         │
│    → Works in Instagram/Facebook in-app browsers!           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Benefits

✅ **Works in In-App Browsers** - Instagram, Facebook, WhatsApp browsers can access Google Drive links  
✅ **Cloud Backup** - All PDFs stored in Google Drive  
✅ **Alternative Download** - If direct download fails, user can use Google Drive  
✅ **Automatic Upload** - No manual intervention needed  
✅ **Shareable Links** - Easy to share PDFs with users  

---

## 🔒 Security Notes

- 🔐 Service account key is **highly sensitive** - never commit it to Git
- 🔐 `.env` file is in `.gitignore` - make sure it stays there
- 🔐 Service account has access ONLY to the specific folder you shared
- 🔐 PDFs are set to "anyone with link can view" - no Google account needed

---

## 📝 Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_DRIVE_CLIENT_EMAIL` | Service account email | `voter-slips@project.iam.gserviceaccount.com` |
| `GOOGLE_DRIVE_PRIVATE_KEY` | Service account private key (JSON) | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `GOOGLE_DRIVE_FOLDER_ID` | Target folder ID from Drive URL | `1gnQGReIAfro_krrMzzu65F_ONegnjHVG` |

---

## 🎉 You're Done!

Your system is now configured to automatically upload PDFs to Google Drive and provide shareable links for users in in-app browsers.

If you encounter any issues, check the server logs for detailed error messages.
