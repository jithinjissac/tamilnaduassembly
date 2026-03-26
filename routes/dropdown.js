import express from 'express';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyConfigWithFallback } from '../utils/proxyConfig.js';

const router = express.Router();

const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

// Create axios instance with proxy configuration
function createAxiosInstance() {
  const proxyConfig = getProxyConfigWithFallback();
  const config = {
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ml-IN,ml;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${SEC_BASE_URL}/public/voters/list`,
      'Cookie': 'set_locale=ml; device_view=full'
    }
  };

  if (proxyConfig) {
    const proxyAgent = new HttpsProxyAgent(proxyConfig.server);
    config.httpsAgent = proxyAgent;
    config.proxy = false;
    console.log('[DROPDOWN] Using proxy agent:', proxyConfig.server);
  }

  return axios.create(config);
}

// District data (static - matches SEC Kerala exactly)
const DISTRICTS = [
  { value: '1', label: 'Kasaragod / കാസറഗോഡ്' },
  { value: '2', label: 'Kannur / കണ്ണൂര്‍' },
  { value: '3', label: 'Wayanad / വയനാട്' },
  { value: '4', label: 'Kozhikode / കോഴിക്കോട്' },
  { value: '5', label: 'Malappuram / മലപ്പുറം' },
  { value: '6', label: 'Palakkad / പാലക്കാട്' },
  { value: '7', label: 'Thrissur / തൃശ്ശൂര്‍' },
  { value: '8', label: 'Ernakulam / എറണാകുളം' },
  { value: '9', label: 'Idukki / ഇടുക്കി' },
  { value: '10', label: 'Kottayam / കോട്ടയം' },
  { value: '11', label: 'Alappuzha / ആലപ്പുഴ' },
  { value: '12', label: 'Pathanamthitta / പത്തനംതിട്ട' },
  { value: '13', label: 'Kollam / കൊല്ലം' },
  { value: '14', label: 'Thiruvananthapuram / തിരുവനന്തപുരം' }
];

/**
 * GET /api/dropdown/districts
 * Returns list of all districts in Kerala
 */
router.get('/districts', (req, res) => {
  try {
    res.json({ 
      status: 'success',
      districts: DISTRICTS 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

/**
 * GET /api/dropdown/assembly-constituencies
 * Returns assembly constituencies for a given district (Kerala only)
 * Query: ?state=S11&district=1
 */
router.get('/assembly-constituencies', async (req, res) => {
  try {
    const { state, district } = req.query;

    if (!state || !district) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'state and district are required' 
      });
    }

    // Format district code (1 → S1101, 2 → S1102, etc.)
    const districtCode = `${state}${district.padStart(2, '0')}`;

    // 🔥 VERIFIED ECI DATA - All 140 Kerala Assembly Constituencies
    const keralaConstituencies = {
      'S1101': [
        { value: '1', label: '1 - MANJESHWAR' },
        { value: '2', label: '2 - KASARAGOD' },
        { value: '3', label: '3 - UDMA' },
        { value: '4', label: '4 - KANHANGAD' },
        { value: '5', label: '5 - TRIKARIPUR' }
      ],
      'S1102': [
        { value: '6', label: '6 - PAYYANNUR' },
        { value: '7', label: '7 - KALLIASSERI' },
        { value: '8', label: '8 - TALIPARAMBA' },
        { value: '9', label: '9 - IRIKKUR' },
        { value: '10', label: '10 - AZHIKODE' },
        { value: '11', label: '11 - KANNUR' },
        { value: '12', label: '12 - DHARMADAM' },
        { value: '13', label: '13 - THALASSERY' },
        { value: '14', label: '14 - KUTHUPARAMBA' },
        { value: '15', label: '15 - MATTANNUR' },
        { value: '16', label: '16 - PERAVOOR' }
      ],
      'S1103': [
        { value: '17', label: '17 - MANANTHAVADY' },
        { value: '18', label: '18 - SULTHANBATHERY' },
        { value: '19', label: '19 - KALPETTA' }
      ],
      'S1104': [
        { value: '20', label: '20 - VADAKARA' },
        { value: '21', label: '21 - KUTTIADI' },
        { value: '22', label: '22 - NADAPURAM' },
        { value: '23', label: '23 - QUILANDY' },
        { value: '24', label: '24 - PERAMBRA' },
        { value: '25', label: '25 - BALUSSERI' },
        { value: '26', label: '26 - ELATHUR' },
        { value: '27', label: '27 - KOZHIKODE NORTH' },
        { value: '28', label: '28 - KOZHIKODE SOUTH' },
        { value: '29', label: '29 - BEYPORE' },
        { value: '30', label: '30 - KUNNAMANGALAM' },
        { value: '31', label: '31 - KODUVALLY' },
        { value: '32', label: '32 - THIRUVAMBADY' }
      ],
      'S1105': [
        { value: '33', label: '33 - KONDOTTY' },
        { value: '34', label: '34 - ERANAD' },
        { value: '35', label: '35 - NILAMBUR' },
        { value: '36', label: '36 - WANDOOR' },
        { value: '37', label: '37 - MANJERI' },
        { value: '38', label: '38 - PERINTHALMANNA' },
        { value: '39', label: '39 - MANKADA' },
        { value: '40', label: '40 - MALAPPURAM' },
        { value: '41', label: '41 - VENGARA' },
        { value: '42', label: '42 - VALLIKKUNNU' },
        { value: '43', label: '43 - TIRURANGADI' },
        { value: '44', label: '44 - TANUR' },
        { value: '45', label: '45 - TIRUR' },
        { value: '46', label: '46 - KOTTAKKAL' },
        { value: '47', label: '47 - THAVANUR' },
        { value: '48', label: '48 - PONNANI' }
      ],
      'S1106': [
        { value: '49', label: '49 - THRITHALA' },
        { value: '50', label: '50 - PATTAMBI' },
        { value: '51', label: '51 - SHORNUR' },
        { value: '52', label: '52 - OTTAPALAM' },
        { value: '53', label: '53 - KONGAD' },
        { value: '54', label: '54 - MANNARKAD' },
        { value: '55', label: '55 - MALAMPUZHA' },
        { value: '56', label: '56 - PALAKKAD' },
        { value: '57', label: '57 - TARUR' },
        { value: '58', label: '58 - CHITTUR' },
        { value: '59', label: '59 - NENMARA' },
        { value: '60', label: '60 - ALATHUR' }
      ],
      'S1107': [
        { value: '61', label: '61 - CHELAKKARA' },
        { value: '62', label: '62 - KUNNAMKULAM' },
        { value: '63', label: '63 - GURUVAYOOR' },
        { value: '64', label: '64 - MANALUR' },
        { value: '65', label: '65 - WADAKKANCHERY' },
        { value: '66', label: '66 - OLLUR' },
        { value: '67', label: '67 - THRISSUR' },
        { value: '68', label: '68 - NATTIKA' },
        { value: '69', label: '69 - KAIPAMANGALAM' },
        { value: '70', label: '70 - IRINJALAKKUDA' },
        { value: '71', label: '71 - PUTHUKKAD' },
        { value: '72', label: '72 - CHALAKKUDY' },
        { value: '73', label: '73 - KODUNGALLUR' }
      ],
      'S1108': [
        { value: '74', label: '74 - PERUMBAVOOR' },
        { value: '75', label: '75 - ANGAMALY' },
        { value: '76', label: '76 - ALUVA' },
        { value: '77', label: '77 - KALAMASSERY' },
        { value: '78', label: '78 - PARAVUR' },
        { value: '79', label: '79 - VYPEN' },
        { value: '80', label: '80 - KOCHI' },
        { value: '81', label: '81 - THRIPUNITHURA' },
        { value: '82', label: '82 - ERANAKULAM' },
        { value: '83', label: '83 - THRIKKAKARA' },
        { value: '84', label: '84 - KUNNATHUNAD' },
        { value: '85', label: '85 - PIRAVOM' },
        { value: '86', label: '86 - MUVATTUPUZHA' },
        { value: '87', label: '87 - KOTHAMANGALAM' }
      ],
      'S1109': [
        { value: '88', label: '88 - DEVIKULAM' },
        { value: '89', label: '89 - UDUMBANCHOLA' },
        { value: '90', label: '90 - THODUPUZHA' },
        { value: '91', label: '91 - IDUKKI' },
        { value: '92', label: '92 - PEERUMADE' }
      ],
      'S1110': [
        { value: '93', label: '93 - PALA' },
        { value: '94', label: '94 - KADUTHURUTHY' },
        { value: '95', label: '95 - VAIKOM' },
        { value: '96', label: '96 - ETTUMANOOR' },
        { value: '97', label: '97 - KOTTAYAM' },
        { value: '98', label: '98 - PUTHUPPALLY' },
        { value: '99', label: '99 - CHANGANASSERY' },
        { value: '100', label: '100 - KANJIRAPPALLY' },
        { value: '101', label: '101 - POONJAR' }
      ],
      'S1111': [
        { value: '102', label: '102 - AROOR' },
        { value: '103', label: '103 - CHERTHALA' },
        { value: '104', label: '104 - ALAPPUZHA' },
        { value: '105', label: '105 - AMBALAPUZHA' },
        { value: '106', label: '106 - KUTTANAD' },
        { value: '107', label: '107 - HARIPAD' },
        { value: '108', label: '108 - KAYAMKULAM' },
        { value: '109', label: '109 - MAVELIKARA' },
        { value: '110', label: '110 - CHENGANNUR' }
      ],
      'S1112': [
        { value: '111', label: '111 - THIRUVALLA' },
        { value: '112', label: '112 - RANNI' },
        { value: '113', label: '113 - ARANMULA' },
        { value: '114', label: '114 - KONNI' },
        { value: '115', label: '115 - ADOOR' }
      ],
      'S1113': [
        { value: '116', label: '116 - KARUNAGAPPALLY' },
        { value: '117', label: '117 - CHAVARA' },
        { value: '118', label: '118 - KUNNATHUR' },
        { value: '119', label: '119 - KOTTARAKKARA' },
        { value: '120', label: '120 - PATHANAPURAM' },
        { value: '121', label: '121 - PUNALUR' },
        { value: '122', label: '122 - CHADAYAMANGALAM' },
        { value: '123', label: '123 - KUNDARA' },
        { value: '124', label: '124 - KOLLAM' },
        { value: '125', label: '125 - ERAVIPURAM' },
        { value: '126', label: '126 - CHATHANNUR' }
      ],
      'S1114': [
        { value: '127', label: '127 - VARKALA' },
        { value: '128', label: '128 - ATTINGAL' },
        { value: '129', label: '129 - CHIRAYINKEEZHU' },
        { value: '130', label: '130 - NEDUMANGAD' },
        { value: '131', label: '131 - VAMANAPURAM' },
        { value: '132', label: '132 - KAZHAKKOOTTAM' },
        { value: '133', label: '133 - VATTIYOORKAVU' },
        { value: '134', label: '134 - THIRUVANANTHAPURAM' },
        { value: '135', label: '135 - NEMOM' },
        { value: '136', label: '136 - ARUVIKKARA' },
        { value: '137', label: '137 - PARASSALA' },
        { value: '138', label: '138 - KATTAKKADA' },
        { value: '139', label: '139 - KOVALAM' },
        { value: '140', label: '140 - NEYYATTINKARA' }
      ]
    };

    const constituencies = keralaConstituencies[districtCode] || [];
    
    if (constituencies.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `No constituencies found for district ${district}`
      });
    }

    res.json({ 
      status: 'success',
      constituencies
    });
  } catch (error) {
    console.error('Error fetching assembly constituencies:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch assembly constituencies',
      error: error.message 
    });
  }
});

/**
 * POST /api/dropdown/local-bodies
 * Returns local bodies for a given district
 * Body: { district_id: "3" }
 */
router.post('/local-bodies', async (req, res) => {
  try {
    const { district_id } = req.body;

    if (!district_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'district_id is required' 
      });
    }

    const axiosInstance = createAxiosInstance();
    const response = await axiosInstance.post(
      `${SEC_BASE_URL}/public/getalllbcmp/byd`,
      `objid=${district_id}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        }
      }
    );

    res.json({ 
      status: 'success',
      local_bodies: response.data.ops1 || []
    });
  } catch (error) {
    console.error('Error fetching local bodies:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch local bodies',
      error: error.message 
    });
  }
});

export default router;
