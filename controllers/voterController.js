import express from 'express';
import { extractVoterList } from '../utils/playwright.js';

const router = express.Router();

/**
 * POST /api/extractVoters
 * Extracts voter list using Playwright automation
 * Body: {
 *   district: "12",
 *   local_body: "pnNXD5bL4J",
 *   ward: "MOZ4EKJBAD",
 *   polling_station: "S8J4PDLKMN",
 *   language: "E",
 *   captcha: "K4B7C"
 * }
 */
router.post('/extractVoters', async (req, res) => {
  try {
    const { district, local_body, ward, polling_station, language, captcha } = req.body;

    // Validate required fields
    if (!district || !local_body || !ward || !polling_station || !language || !captcha) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required: district, local_body, ward, polling_station, language, captcha'
      });
    }

    // Validate language
    if (!['E', 'M', 'T', 'K'].includes(language)) {
      return res.status(400).json({
        status: 'error',
        message: 'Language must be "E" (English), "M" (Malayalam), "T" (Tamil), or "K" (Kannada)'
      });
    }

    console.log('Starting voter extraction with params:', {
      district,
      local_body,
      ward,
      polling_station,
      language
    });

    // Extract voter list using Playwright
    const result = await extractVoterList({
      district,
      local_body,
      ward,
      polling_station,
      language,
      captcha
    });

    if (result.error) {
      return res.status(400).json({
        status: 'error',
        message: result.error,
        details: result.details
      });
    }

    res.json({
      status: 'success',
      district,
      local_body,
      ward,
      polling_station,
      language: language === 'E' ? 'English' : language === 'M' ? 'Malayalam' : language === 'T' ? 'Tamil' : 'Kannada',
      total_voters: result.voters.length,
      voters: result.voters,
      pollingStationMalayalam: result.pollingStationMalayalam || null
    });

  } catch (error) {
    console.error('Error extracting voters:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to extract voter list',
      error: error.message
    });
  }
});

export default router;
