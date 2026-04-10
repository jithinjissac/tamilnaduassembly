import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/googleDrive.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// POST /api/drive/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  if (!isGoogleDriveConfigured()) {
    return res.status(500).json({ success: false, message: 'Google Drive not configured.' });
  }
  try {
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const driveLink = await uploadToGoogleDrive(filePath, originalName);
    // Optionally delete the uploaded file after upload
    fs.unlinkSync(filePath);
    if (driveLink) {
      return res.json({ success: true, driveLink });
    } else {
      return res.status(500).json({ success: false, message: 'Drive upload failed.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
