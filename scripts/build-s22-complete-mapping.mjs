import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://gateway-voters.eci.gov.in';
const ECI_PAGE_URL = 'https://voters.eci.gov.in/download-eroll?stateCode=S22';
const TN_AC_WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_constituencies_of_the_Tamil_Nadu_Legislative_Assembly';
const OUT_FILE = path.join('data', 'eci', 'eci-s22-district-constituency-mapping-complete.json');
const DOM_SNAPSHOT_FILE = path.join('data', 'eci', 'eci-s22-dom.html');

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

function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function getDistrictCodeNameMap() {
    let html = '';
    try {
        const response = await axios.get(ECI_PAGE_URL, { timeout: 60000 });
        html = response.data;
    } catch {
        html = '';
    }

    if (!html) {
        html = await fs.readFile(DOM_SNAPSHOT_FILE, 'utf8');
    }

    let $ = cheerio.load(html);
    const map = new Map();

    $('select[name="district"] option').each((_, option) => {
        const code = normalizeText($(option).attr('value'));
        const name = normalizeText($(option).text());
        if (!code) {
            return;
        }
        map.set(code, name);
    });

    if (map.size === 0) {
        const fallbackHtml = await fs.readFile(DOM_SNAPSHOT_FILE, 'utf8');
        $ = cheerio.load(fallbackHtml);
        $('select[name="district"] option').each((_, option) => {
            const code = normalizeText($(option).attr('value'));
            const name = normalizeText($(option).text());
            if (!code) {
                return;
            }
            map.set(code, name);
        });
    }

    if (map.size === 0) {
        throw new Error('Could not parse district codes from ECI page or DOM snapshot');
    }

    return map;
}

async function getAcNumberNameMap() {
    const response = await axios.get(TN_AC_WIKI_URL, {
        timeout: 60000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    const $ = cheerio.load(response.data);
    const map = new Map();

    $('table.wikitable tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) {
            return;
        }

        const numberText = normalizeText($(cells[0]).text());
        const acNumber = Number(numberText);
        if (!Number.isInteger(acNumber)) {
            return;
        }

        const name = normalizeText($(cells[1]).text());
        if (!name) {
            return;
        }

        if (!map.has(acNumber)) {
            map.set(acNumber, name);
        }
    });

    if (map.size < 200) {
        throw new Error(`Unexpected AC name coverage from wiki source (${map.size})`);
    }

    return map;
}

async function getAcDistrictCode(acNumber) {
    const payload = {
        stateCd: 'S22',
        acNumber,
        rollTypeRefId: 'S22-2026-FIR',
        pdfGenType: 'EROLLGEN',
        revisionNo: 1,
        year: 2026,
    };

    const response = await axios.post(
        `${BASE_URL}/api/v1/printing-publish/get-publish-part-list`,
        payload,
        {
            headers,
            timeout: 30000,
        },
    );

    const first = Array.isArray(response.data?.payload) ? response.data.payload[0] : null;
    return first?.districtCd || null;
}

async function buildMapping() {
    const districtNameByCode = await getDistrictCodeNameMap();
    const acNameByNumber = await getAcNumberNameMap();
    const districts = new Map();
    const failures = [];

    for (let acNumber = 1; acNumber <= 234; acNumber += 1) {
        process.stdout.write(`\rFetching AC ${acNumber}/234 ...`);
        try {
            const districtCode = await getAcDistrictCode(acNumber);
            if (!districtCode) {
                failures.push({ acNumber, reason: 'No districtCd in payload' });
                await sleep(120);
                continue;
            }

            const districtName = districtNameByCode.get(districtCode) || districtCode;
            const acName = acNameByNumber.get(acNumber) || `ASSEMBLY CONSTITUENCY ${acNumber}`;

            if (!districts.has(districtCode)) {
                districts.set(districtCode, {
                    districtCode,
                    districtName,
                    constituencies: [],
                });
            }

            districts.get(districtCode).constituencies.push({
                value: String(acNumber),
                text: `${acNumber} - ${acName}`,
                acNumber,
                acName,
            });
        } catch (error) {
            failures.push({ acNumber, reason: error.message });
        }

        await sleep(120);
    }

    process.stdout.write('\n');

    const districtRows = Array.from(districts.values())
        .map((district) => ({
            ...district,
            constituencies: district.constituencies.sort((a, b) => a.acNumber - b.acNumber),
            constituencyCount: district.constituencies.length,
            error: null,
        }))
        .sort((a, b) => a.districtCode.localeCompare(b.districtCode));

    return {
        generatedAt: new Date().toISOString(),
        source: 'ECI districtCd + public AC names',
        sourceDetails: {
            districtCodes: ECI_PAGE_URL,
            districtMappingApi: `${BASE_URL}/api/v1/printing-publish/get-publish-part-list`,
            acNameSource: TN_AC_WIKI_URL,
        },
        stateCode: 'S22',
        stateName: 'Tamil Nadu',
        year: 2026,
        rollTypeValue: 'S22-2026-FIR',
        districtCount: districtRows.length,
        totalConstituencies: districtRows.reduce((sum, district) => sum + district.constituencyCount, 0),
        districts: districtRows,
        failures,
    };
}

async function main() {
    const mapping = await buildMapping();
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, JSON.stringify(mapping, null, 2));

    console.log(JSON.stringify({
        outFile: OUT_FILE,
        districtCount: mapping.districtCount,
        totalConstituencies: mapping.totalConstituencies,
        failures: mapping.failures.length,
    }, null, 2));
}

main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
});