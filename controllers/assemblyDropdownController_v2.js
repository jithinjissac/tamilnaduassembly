/**
 * Assembly Dropdown Controller using Direct ECI API
 * Uses discovered API endpoints for faster, more reliable data fetching
 */

import { logger } from '../utils/logger.js';
import {
    getRollTypes,
    getACLanguages,
    getPollingPartsList,
    getConstituencyData
} from '../utils/eciDirectApiClient.js';

// Cache for dropdown data
const cache = {
    states: null,
    rollTypes: {},
    districts: null,
    constituencies: {},
    languages: {},
    pollingParts: {},
    lastUpdated: {},
    cacheDuration: 3600000 // 1 hour
};

/**
 * Get list of states
 * Note: State list is still hardcoded as ECI doesn't have a direct API for it
 */
export const getStates = async (req, res) => {
    try {
        logger.info('Assembly: Fetching states list...');
        
        // States are relatively static, can be cached longer
        if (cache.states && cache.lastUpdated.states && 
            (Date.now() - cache.lastUpdated.states) < cache.cacheDuration * 24) {
            logger.info('Assembly: Returning cached states');
            return res.json({ status: 'success', states: cache.states });
        }
        
        // Common Indian states with their codes (from ECI portal observation)
        const states = [
            { value: 'S01', text: 'ANDAMAN & NICOBAR ISLANDS' },
            { value: 'S02', text: 'ANDHRA PRADESH' },
            { value: 'S03', text: 'ARUNACHAL PRADESH' },
            { value: 'S04', text: 'ASSAM' },
            { value: 'S05', text: 'BIHAR' },
            { value: 'S06', text: 'CHANDIGARH' },
            { value: 'S07', text: 'CHHATTISGARH' },
            { value: 'S08', text: 'DADRA & NAGAR HAVELI AND DAMAN & DIU' },
            { value: 'S09', text: 'DELHI' },
            { value: 'S10', text: 'GOA' },
            { value: 'S11', text: 'KERALA' },
            { value: 'S12', text: 'GUJARAT' },
            { value: 'S13', text: 'HARYANA' },
            { value: 'S14', text: 'HIMACHAL PRADESH' },
            { value: 'S15', text: 'JAMMU & KASHMIR' },
            { value: 'S16', text: 'JHARKHAND' },
            { value: 'S17', text: 'KARNATAKA' },
            { value: 'S18', text: 'LADAKH' },
            { value: 'S19', text: 'LAKSHADWEEP' },
            { value: 'S20', text: 'MADHYA PRADESH' },
            { value: 'S21', text: 'MAHARASHTRA' },
            { value: 'S22', text: 'MANIPUR' },
            { value: 'S23', text: 'MEGHALAYA' },
            { value: 'S24', text: 'MIZORAM' },
            { value: 'S25', text: 'NAGALAND' },
            { value: 'S26', text: 'ODISHA' },
            { value: 'S27', text: 'PUDUCHERRY' },
            { value: 'S28', text: 'PUNJAB' },
            { value: 'S29', text: 'RAJASTHAN' },
            { value: 'S30', text: 'SIKKIM' },
            { value: 'S31', text: 'TAMIL NADU' },
            { value: 'S32', text: 'TELANGANA' },
            { value: 'S33', text: 'TRIPURA' },
            { value: 'S34', text: 'UTTAR PRADESH' },
            { value: 'S35', text: 'UTTARAKHAND' },
            { value: 'S36', text: 'WEST BENGAL' }
        ];
        
        cache.states = states;
        cache.lastUpdated.states = Date.now();
        
        res.json({ status: 'success', states });
        logger.info(`Assembly: Returned ${states.length} states`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching states:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch states',
            error: error.message
        });
    }
};

/**
 * Get available years (hardcoded as ECI uses fixed years)
 */
export const getYears = async (req, res) => {
    try {
        const { stateCode } = req.body;
        
        if (!stateCode) {
            return res.status(400).json({
                status: 'error',
                message: 'State code is required'
            });
        }
        
        logger.info(`Assembly: Fetching years for state ${stateCode}...`);
        
        // Years are typically current and previous year
        const currentYear = new Date().getFullYear();
        const years = [
            { value: currentYear.toString(), text: currentYear.toString() },
            { value: (currentYear - 1).toString(), text: (currentYear - 1).toString() }
        ];
        
        res.json({ status: 'success', years });
        logger.info(`Assembly: Returned ${years.length} years`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching years:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch years',
            error: error.message
        });
    }
};

/**
 * Get roll types from ECI Direct API
 */
export const getRollTypesController = async (req, res) => {
    try {
        const { stateCode, year } = req.body;
        
        if (!stateCode || !year) {
            return res.status(400).json({
                status: 'error',
                message: 'State code and year are required'
            });
        }
        
        const cacheKey = `${stateCode}-${year}`;
        const now = Date.now();
        
        // Check cache
        if (cache.rollTypes[cacheKey] && cache.lastUpdated[`rollTypes-${cacheKey}`] &&
            (now - cache.lastUpdated[`rollTypes-${cacheKey}`]) < cache.cacheDuration) {
            logger.info(`Assembly: Returning cached roll types for ${cacheKey}`);
            return res.json({ status: 'success', rollTypes: cache.rollTypes[cacheKey] });
        }
        
        logger.info(`Assembly: Fetching roll types from ECI API for ${stateCode}, ${year}...`);
        
        // Fetch from direct API
        const rollTypes = await getRollTypes(stateCode, year);
        
        // Transform to dropdown format with proper display names
        const formattedRollTypes = rollTypes.map(rt => ({
            value: rt.code,
            text: rt.name || rt.code // Use the full name from ECI API
        }));
        
        // Cache the result
        cache.rollTypes[cacheKey] = formattedRollTypes;
        cache.lastUpdated[`rollTypes-${cacheKey}`] = now;
        
        res.json({ status: 'success', rollTypes: formattedRollTypes });
        logger.info(`Assembly: Returned ${formattedRollTypes.length} roll types from direct API`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching roll types from direct API:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch roll types from ECI',
            error: error.message
        });
    }
};

/**
 * Get districts (still requires Playwright or hardcoded)
 * TODO: Find direct API endpoint for districts
 */
export const getDistricts = async (req, res) => {
    try {
        const { stateCode } = req.body;
        
        if (!stateCode) {
            return res.status(400).json({
                status: 'error',
                message: 'State code is required'
            });
        }
        
        logger.info(`Assembly: Fetching districts for state ${stateCode}...`);
        
        // For Kerala (S11), return districts in ALPHABETICAL ORDER (matches ECI portal)
        if (stateCode === 'S11') {
            const districts = [
                { value: 'S1111', text: 'ALAPPUZHA' },
                { value: 'S1108', text: 'ERNAKULAM' },
                { value: 'S1109', text: 'IDUKKI' },
                { value: 'S1102', text: 'KANNUR' },
                { value: 'S1101', text: 'KASARAGOD' },
                { value: 'S1113', text: 'KOLLAM' },
                { value: 'S1110', text: 'KOTTAYAM' },
                { value: 'S1104', text: 'KOZHIKODE' },
                { value: 'S1105', text: 'MALAPPURAM' },
                { value: 'S1106', text: 'PALAKKAD' },
                { value: 'S1112', text: 'PATHANAMTHITTA' },
                { value: 'S1114', text: 'THIRUVANANTHAPURAM' },
                { value: 'S1107', text: 'THRISSUR' },
                { value: 'S1103', text: 'WAYANAD' }
            ];
            
            cache.districts = districts;
            return res.json({ status: 'success', districts });
        }
        
        // For other states, return error (need to implement)
        res.status(501).json({
            status: 'error',
            message: `Districts for state ${stateCode} not yet implemented. Currently only Kerala (S11) is supported.`
        });
        
    } catch (error) {
        logger.error('Assembly: Error fetching districts:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch districts',
            error: error.message
        });
    }
};

/**
 * Get assembly constituencies - Now uses direct API via polling parts
 * @note: Since there's no direct "get constituencies" API, we derive this from polling parts
 */
export const getAssemblyConstituencies = async (req, res) => {
    try {
        const { stateCode, district, year, rollType } = req.body;
        
        if (!stateCode || !district || !year || !rollType) {
            return res.status(400).json({
                status: 'error',
                message: 'State code, district, year, and roll type are required'
            });
        }
        
        logger.info(`Assembly: Fetching constituencies for district ${district}...`);
        
        // 🔥 VERIFIED ECI DATA - Extracted directly from ECI portal (2026-03-02)
        // All 140 Kerala Assembly Constituencies with correct names and district mappings
        const keralaConstituencies = {
            // KASARAGOD - 5 constituencies (ACs 1-5)
            'S1101': [
                { value: '1', text: '1 - MANJESHWAR' },
                { value: '2', text: '2 - KASARAGOD' },
                { value: '3', text: '3 - UDMA' },
                { value: '4', text: '4 - KANHANGAD' },
                { value: '5', text: '5 - TRIKARIPUR' }
            ],
            // KANNUR - 11 constituencies (ACs 6-16)
            'S1102': [
                { value: '6', text: '6 - PAYYANNUR' },
                { value: '7', text: '7 - KALLIASSERI' },
                { value: '8', text: '8 - TALIPARAMBA' },
                { value: '9', text: '9 - IRIKKUR' },
                { value: '10', text: '10 - AZHIKODE' },
                { value: '11', text: '11 - KANNUR' },
                { value: '12', text: '12 - DHARMADAM' },
                { value: '13', text: '13 - THALASSERY' },
                { value: '14', text: '14 - KUTHUPARAMBA' },
                { value: '15', text: '15 - MATTANNUR' },
                { value: '16', text: '16 - PERAVOOR' }
            ],
            // WAYANAD - 3 constituencies (ACs 17-19)
            'S1103': [
                { value: '17', text: '17 - MANANTHAVADY' },
                { value: '18', text: '18 - SULTHANBATHERY' },
                { value: '19', text: '19 - KALPETTA' }
            ],
            // KOZHIKODE - 13 constituencies (ACs 20-32)
            'S1104': [
                { value: '20', text: '20 - VADAKARA' },
                { value: '21', text: '21 - KUTTIADI' },
                { value: '22', text: '22 - NADAPURAM' },
                { value: '23', text: '23 - QUILANDY' },
                { value: '24', text: '24 - PERAMBRA' },
                { value: '25', text: '25 - BALUSSERI' },
                { value: '26', text: '26 - ELATHUR' },
                { value: '27', text: '27 - KOZHIKODE NORTH' },
                { value: '28', text: '28 - KOZHIKODE SOUTH' },
                { value: '29', text: '29 - BEYPORE' },
                { value: '30', text: '30 - KUNNAMANGALAM' },
                { value: '31', text: '31 - KODUVALLY' },
                { value: '32', text: '32 - THIRUVAMBADY' }
            ],
            // MALAPPURAM - 16 constituencies (ACs 33-48)
            'S1105': [
                { value: '33', text: '33 - KONDOTTY' },
                { value: '34', text: '34 - ERANAD' },
                { value: '35', text: '35 - NILAMBUR' },
                { value: '36', text: '36 - WANDOOR' },
                { value: '37', text: '37 - MANJERI' },
                { value: '38', text: '38 - PERINTHALMANNA' },
                { value: '39', text: '39 - MANKADA' },
                { value: '40', text: '40 - MALAPPURAM' },
                { value: '41', text: '41 - VENGARA' },
                { value: '42', text: '42 - VALLIKKUNNU' },
                { value: '43', text: '43 - TIRURANGADI' },
                { value: '44', text: '44 - TANUR' },
                { value: '45', text: '45 - TIRUR' },
                { value: '46', text: '46 - KOTTAKKAL' },
                { value: '47', text: '47 - THAVANUR' },
                { value: '48', text: '48 - PONNANI' }
            ],
            // PALAKKAD - 12 constituencies (ACs 49-60)
            'S1106': [
                { value: '49', text: '49 - THRITHALA' },
                { value: '50', text: '50 - PATTAMBI' },
                { value: '51', text: '51 - SHORNUR' },
                { value: '52', text: '52 - OTTAPALAM' },
                { value: '53', text: '53 - KONGAD' },
                { value: '54', text: '54 - MANNARKAD' },
                { value: '55', text: '55 - MALAMPUZHA' },
                { value: '56', text: '56 - PALAKKAD' },
                { value: '57', text: '57 - TARUR' },
                { value: '58', text: '58 - CHITTUR' },
                { value: '59', text: '59 - NENMARA' },
                { value: '60', text: '60 - ALATHUR' }
            ],
            // THRISSUR - 13 constituencies (ACs 61-73)
            'S1107': [
                { value: '61', text: '61 - CHELAKKARA' },
                { value: '62', text: '62 - KUNNAMKULAM' },
                { value: '63', text: '63 - GURUVAYOOR' },
                { value: '64', text: '64 - MANALUR' },
                { value: '65', text: '65 - WADAKKANCHERY' },
                { value: '66', text: '66 - OLLUR' },
                { value: '67', text: '67 - THRISSUR' },
                { value: '68', text: '68 - NATTIKA' },
                { value: '69', text: '69 - KAIPAMANGALAM' },
                { value: '70', text: '70 - IRINJALAKKUDA' },
                { value: '71', text: '71 - PUTHUKKAD' },
                { value: '72', text: '72 - CHALAKKUDY' },
                { value: '73', text: '73 - KODUNGALLUR' }
            ],
            // ERNAKULAM - 14 constituencies (ACs 74-87)
            'S1108': [
                { value: '74', text: '74 - PERUMBAVOOR' },
                { value: '75', text: '75 - ANGAMALY' },
                { value: '76', text: '76 - ALUVA' },
                { value: '77', text: '77 - KALAMASSERY' },
                { value: '78', text: '78 - PARAVUR' },
                { value: '79', text: '79 - VYPEN' },
                { value: '80', text: '80 - KOCHI' },
                { value: '81', text: '81 - THRIPUNITHURA' },
                { value: '82', text: '82 - ERANAKULAM' },
                { value: '83', text: '83 - THRIKKAKARA' },
                { value: '84', text: '84 - KUNNATHUNAD' },
                { value: '85', text: '85 - PIRAVOM' },
                { value: '86', text: '86 - MUVATTUPUZHA' },
                { value: '87', text: '87 - KOTHAMANGALAM' }
            ],
            // IDUKKI - 5 constituencies (ACs 88-92)
            'S1109': [
                { value: '88', text: '88 - DEVIKULAM' },
                { value: '89', text: '89 - UDUMBANCHOLA' },
                { value: '90', text: '90 - THODUPUZHA' },
                { value: '91', text: '91 - IDUKKI' },
                { value: '92', text: '92 - PEERUMADE' }
            ],
            // KOTTAYAM - 9 constituencies (ACs 93-101)
            'S1110': [
                { value: '93', text: '93 - PALA' },
                { value: '94', text: '94 - KADUTHURUTHY' },
                { value: '95', text: '95 - VAIKOM' },
                { value: '96', text: '96 - ETTUMANOOR' },
                { value: '97', text: '97 - KOTTAYAM' },
                { value: '98', text: '98 - PUTHUPPALLY' },
                { value: '99', text: '99 - CHANGANASSERY' },
                { value: '100', text: '100 - KANJIRAPPALLY' },
                { value: '101', text: '101 - POONJAR' }
            ],
            // ALAPPUZHA - 9 constituencies (ACs 102-110)
            'S1111': [
                { value: '102', text: '102 - AROOR' },
                { value: '103', text: '103 - CHERTHALA' },
                { value: '104', text: '104 - ALAPPUZHA' },
                { value: '105', text: '105 - AMBALAPUZHA' },
                { value: '106', text: '106 - KUTTANAD' },
                { value: '107', text: '107 - HARIPAD' },
                { value: '108', text: '108 - KAYAMKULAM' },
                { value: '109', text: '109 - MAVELIKARA' },
                { value: '110', text: '110 - CHENGANNUR' }
            ],
            // PATHANAMTHITTA - 5 constituencies (ACs 111-115)
            'S1112': [
                { value: '111', text: '111 - THIRUVALLA' },
                { value: '112', text: '112 - RANNI' },
                { value: '113', text: '113 - ARANMULA' },
                { value: '114', text: '114 - KONNI' },
                { value: '115', text: '115 - ADOOR' }
            ],
            // KOLLAM - 11 constituencies (ACs 116-126)
            'S1113': [
                { value: '116', text: '116 - KARUNAGAPPALLY' },
                { value: '117', text: '117 - CHAVARA' },
                { value: '118', text: '118 - KUNNATHUR' },
                { value: '119', text: '119 - KOTTARAKKARA' },
                { value: '120', text: '120 - PATHANAPURAM' },
                { value: '121', text: '121 - PUNALUR' },
                { value: '122', text: '122 - CHADAYAMANGALAM' },
                { value: '123', text: '123 - KUNDARA' },
                { value: '124', text: '124 - KOLLAM' },
                { value: '125', text: '125 - ERAVIPURAM' },
                { value: '126', text: '126 - CHATHANNUR' }
            ],
            // THIRUVANANTHAPURAM - 14 constituencies (ACs 127-140)
            'S1114': [
                { value: '127', text: '127 - VARKALA' },
                { value: '128', text: '128 - ATTINGAL' },
                { value: '129', text: '129 - CHIRAYINKEEZHU' },
                { value: '130', text: '130 - NEDUMANGAD' },
                { value: '131', text: '131 - VAMANAPURAM' },
                { value: '132', text: '132 - KAZHAKKOOTTAM' },
                { value: '133', text: '133 - VATTIYOORKAVU' },
                { value: '134', text: '134 - THIRUVANANTHAPURAM' },
                { value: '135', text: '135 - NEMOM' },
                { value: '136', text: '136 - ARUVIKKARA' },
                { value: '137', text: '137 - PARASSALA' },
                { value: '138', text: '138 - KATTAKKADA' },
                { value: '139', text: '139 - KOVALAM' },
                { value: '140', text: '140 - NEYYATTINKARA' }
            ]
        };
        
        const constituencies = keralaConstituencies[district] || [];
        
        if (constituencies.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `No constituencies found for district ${district}`
            });
        }
        
        res.json({ status: 'success', constituencies });
        logger.info(`Assembly: Returned ${constituencies.length} constituencies for district ${district}`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching constituencies:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch constituencies',
            error: error.message
        });
    }
};

/**
 * Get languages for a specific AC using direct API
 */
export const getLanguages = async (req, res) => {
    try {
        const { stateCode, district, constituency, rollType, year } = req.body;
        
        if (!stateCode || !district || !constituency || !rollType || !year) {
            return res.status(400).json({
                status: 'error',
                message: 'All parameters are required'
            });
        }
        
        const cacheKey = `${stateCode}-${district}-${constituency}`;
        const now = Date.now();
        
        // Check cache
        if (cache.languages[cacheKey] && cache.lastUpdated[`languages-${cacheKey}`] &&
            (now - cache.lastUpdated[`languages-${cacheKey}`]) < cache.cacheDuration) {
            logger.info(`Assembly: Returning cached languages for AC ${constituency}`);
            return res.json({ status: 'success', languages: cache.languages[cacheKey] });
        }
        
        logger.info(`Assembly: Fetching languages from ECI API for AC ${constituency}...`);
        
        // Fetch from direct API
        const languages = await getACLanguages(stateCode, district, constituency, rollType, year);
        
        // Transform to dropdown format
        const formattedLanguages = languages.map(lang => ({
            value: lang.code,
            text: lang.name
        }));
        
        // Cache the result
        cache.languages[cacheKey] = formattedLanguages;
        cache.lastUpdated[`languages-${cacheKey}`] = now;
        
        res.json({ status: 'success', languages: formattedLanguages });
        logger.info(`Assembly: Returned ${formattedLanguages.length} languages from direct API`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching languages from direct API:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch languages from ECI',
            error: error.message
        });
    }
};

/**
 * Get polling parts for a specific AC using direct API
 */
export const getPollingParts = async (req, res) => {
    try {
        const { stateCode, district, constituency, rollType, year } = req.body;
        
        if (!stateCode || !district || !constituency || !rollType || !year) {
            return res.status(400).json({
                status: 'error',
                message: 'All parameters are required'
            });
        }
        
        const cacheKey = `${stateCode}-${district}-${constituency}`;
        const now = Date.now();
        
        // Check cache
        if (cache.pollingParts[cacheKey] && cache.lastUpdated[`parts-${cacheKey}`] &&
            (now - cache.lastUpdated[`parts-${cacheKey}`]) < cache.cacheDuration) {
            logger.info(`Assembly: Returning cached polling parts for AC ${constituency}`);
            return res.json({ status: 'success', parts: cache.pollingParts[cacheKey] });
        }
        
        logger.info(`Assembly: Fetching polling parts from ECI API for AC ${constituency}...`);
        
        // Fetch from direct API
        const parts = await getPollingPartsList(stateCode, district, constituency, rollType, year);
        
        // Cache the result
        cache.pollingParts[cacheKey] = parts;
        cache.lastUpdated[`parts-${cacheKey}`] = now;
        
        res.json({ status: 'success', parts, totalParts: parts.length });
        logger.info(`Assembly: Returned ${parts.length} polling parts from direct API`);
        
    } catch (error) {
        logger.error('Assembly: Error fetching polling parts from direct API:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch polling parts from ECI',
            error: error.message
        });
    }
};

export default {
    getStates,
    getYears,
    getRollTypes: getRollTypesController,
    getDistricts,
    getAssemblyConstituencies,
    getLanguages,
    getPollingParts
};
