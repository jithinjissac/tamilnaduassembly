import axios from 'axios';

const BASE_URL = 'https://gateway-voters.eci.gov.in';

const headers = {
  Accept: '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  Origin: 'https://voters.eci.gov.in',
  Referer: 'https://voters.eci.gov.in/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  applicationname: 'VSP',
  channelidobo: 'VSP',
  'platform-type': 'ECIWEB',
  'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

async function fetch(acNumber) {
  const body = {
    stateCd: 'S22',
    acNumber,
    rollTypeRefId: 'S22-2026-FIR',
    pdfGenType: 'EROLLGEN',
    revisionNo: 1,
    year: 2026,
  };

  const response = await axios.post(`${BASE_URL}/api/v1/printing-publish/get-publish-part-list`, body, { headers, timeout: 30000 });
  const payload = Array.isArray(response.data?.payload) ? response.data.payload : [];
  const first = payload[0] || null;
  return {
    acNumber,
    payloadCount: payload.length,
    keys: first ? Object.keys(first) : [],
    first,
  };
}

const samples = [11, 98, 149];
for (const ac of samples) {
  try {
    const result = await fetch(ac);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ acNumber: ac, error: error.message }, null, 2));
  }
}
