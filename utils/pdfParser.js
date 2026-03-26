import pdf from 'pdf-parse';
import fs from 'fs';
import { logger } from './logger.js';

/**
 * Parse voter data from ECI PDF
 * ECI PDFs typically contain voter lists with:
 * - Serial number
 * - Name
 * - Relative's name (Father/Mother/Husband)
 * - House number
 * - Age
 * - Gender
 * - EPIC number (Voter ID)
 */
export const parsePDFVoterData = async (pdfPath) => {
    try {
        logger.info(`Parsing PDF: ${pdfPath}`);

        // Read PDF file
        const dataBuffer = fs.readFileSync(pdfPath);
        
        // Parse PDF
        const data = await pdf(dataBuffer);
        const text = data.text;

        logger.info(`PDF parsed, extracting voter data from ${text.length} characters`);
        logger.info(`PDF first 1000 characters:\n${text.substring(0, 1000)}`);
        logger.info(`PDF has ${data.numpages} pages`);

        // Extract voter records
        // Pattern varies by state and format, this is a generic approach
        const voters = [];
        
        // Split by pages or common delimiters
        const lines = text.split('\n');
        
        let currentVoter = null;
        let serialCounter = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line) continue;

            // Detect voter entry starts (common patterns)
            // Pattern 1: Serial number at start of line
            const serialMatch = line.match(/^(\d+)\s+/);
            
            if (serialMatch) {
                // Save previous voter if exists
                if (currentVoter && currentVoter.name) {
                    voters.push(currentVoter);
                }

                // Start new voter
                currentVoter = {
                    serialNo: serialMatch[1],
                    name: '',
                    relativeName: '',
                    relationType: '',
                    houseNo: '',
                    age: '',
                    gender: '',
                    epicNo: ''
                };

                // Extract name from same line
                const nameMatch = line.substring(serialMatch[0].length).match(/^([A-Z\s]+)/);
                if (nameMatch) {
                    currentVoter.name = nameMatch[1].trim();
                }
            }
            
            // Extract EPIC number (pattern: ABC1234567)
            const epicMatch = line.match(/([A-Z]{3}\d{7})/);
            if (epicMatch && currentVoter) {
                currentVoter.epicNo = epicMatch[1];
            }

            // Extract age (pattern: Age: 25 or just number followed by Years)
            const ageMatch = line.match(/(?:Age:|Age)\s*:?\s*(\d{1,3})|(\d{1,3})\s*(?:Years|Yrs)/i);
            if (ageMatch && currentVoter) {
                currentVoter.age = ageMatch[1] || ageMatch[2];
            }

            // Extract gender (M/F/O or Male/Female/Other)
            const genderMatch = line.match(/\b(Male|Female|Other|M|F|O)\b/i);
            if (genderMatch && currentVoter) {
                const gender = genderMatch[1].toUpperCase();
                currentVoter.gender = gender === 'MALE' || gender === 'M' ? 'M' : 
                                     gender === 'FEMALE' || gender === 'F' ? 'F' : 'O';
            }

            // Extract house number
            const houseMatch = line.match(/House\s*(?:No|Number)?:?\s*([A-Z0-9\-\/]+)/i);
            if (houseMatch && currentVoter) {
                currentVoter.houseNo = houseMatch[1];
            }

            // Extract relative info (Father/Mother/Husband)
            const relativeMatch = line.match(/(Father|Mother|Husband)(?:'s Name)?:?\s*([A-Z\s]+)/i);
            if (relativeMatch && currentVoter) {
                currentVoter.relationType = relativeMatch[1];
                currentVoter.relativeName = relativeMatch[2].trim();
            }
        }

        // Add last voter
        if (currentVoter && currentVoter.name) {
            voters.push(currentVoter);
        }

        logger.info(`First parsing pass extracted ${voters.length} voters`);

        // If structured parsing failed, try alternative method
        if (voters.length === 0) {
            logger.warn('Structured parsing yielded no results, trying alternative method');
            logger.info(`Sample lines from PDF:\n${lines.slice(0, 30).join('\n')}`);
            
            // Alternative: Extract all text blocks that look like voter entries
            const blocks = text.split(/\n\s*\n/);
            
            for (const block of blocks) {
                const lines = block.split('\n').map(l => l.trim()).filter(l => l);
                
                if (lines.length < 2) continue;

                // Look for EPIC number as identifier
                const epicMatch = block.match(/([A-Z]{3}\d{7})/);
                if (!epicMatch) continue;

                const voter = {
                    serialNo: serialCounter++,
                    name: '',
                    relativeName: '',
                    relationType: '',
                    houseNo: '',
                    age: '',
                    gender: '',
                    epicNo: epicMatch[1]
                };

                // Extract name (usually first line or after serial number)
                const nameMatch = block.match(/^(?:\d+\s+)?([A-Z][A-Z\s]{2,50}?)(?:\n|Age|Father|Mother|Husband)/i);
                if (nameMatch) {
                    voter.name = nameMatch[1].trim();
                }

                // Extract other fields
                const ageMatch = block.match(/Age:?\s*(\d{1,3})/i);
                if (ageMatch) voter.age = ageMatch[1];

                const genderMatch = block.match(/\b(Male|Female|M|F)\b/i);
                if (genderMatch) {
                    const g = genderMatch[1].toUpperCase();
                    voter.gender = g === 'MALE' || g === 'M' ? 'M' : 'F';
                }

                const houseMatch = block.match(/House.*?:?\s*([A-Z0-9\-\/]+)/i);
                if (houseMatch) voter.houseNo = houseMatch[1];

                const relMatch = block.match(/(Father|Mother|Husband).*?:?\s*([A-Z][A-Z\s]{2,50}?)(?:\n|Age|House|$)/i);
                if (relMatch) {
                    voter.relationType = relMatch[1];
                    voter.relativeName = relMatch[2].trim();
                }

                if (voter.name) {
                    voters.push(voter);
                }
            }
            
            logger.info(`Alternative parsing method extracted ${voters.length} voters`);
        }

        logger.info(`Successfully extracted ${voters.length} voters from PDF`);
        
        if (voters.length === 0) {
            logger.error('⚠️ No voters extracted! This might indicate:');
            logger.error('   1. PDF format is different from expected');
            logger.error('   2. PDF might be in Malayalam or different language');
            logger.error('   3. PDF structure needs custom parsing logic');
            logger.error(`   First 2000 chars of PDF:\n${text.substring(0, 2000)}`);
        }

        // Delete PDF file after parsing (cleanup) - ONLY if voters were extracted
        if (voters.length > 0) {
            try {
                fs.unlinkSync(pdfPath);
                logger.info(`Cleaned up PDF file: ${pdfPath}`);
            } catch (error) {
                logger.warn(`Could not delete PDF file ${pdfPath}:`, error.message);
            }
        } else {
            logger.info(`⚠️ Keeping PDF file for debugging: ${pdfPath}`);
        }

        return voters;
    } catch (error) {
        logger.error('Error parsing PDF:', error);
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
};

/**
 * Validate voter data structure
 */
export const validateVoterData = (voter) => {
    const required = ['name', 'epicNo'];
    const missing = required.filter(field => !voter[field]);
    
    if (missing.length > 0) {
        return {
            valid: false,
            missing
        };
    }

    return { valid: true };
};

export default {
    parsePDFVoterData,
    validateVoterData
};
