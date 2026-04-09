import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { getRollTypes } from '../utils/eciDirectApiClient.js';

const BASE_URL = 'https://gateway-voters.eci.gov.in';
const DEFAULT_DELAY_MS = 250;

const getHeaders = () => ({
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
});

function parseArgs(argv) {
    const options = {
        stateCode: '',
        year: new Date().getFullYear(),
        fromAc: 1,
        maxAc: 0,
        outFile: '',
        delayMs: DEFAULT_DELAY_MS,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--state' && next) {
            options.stateCode = next.toUpperCase();
            index += 1;
            continue;
        }

        if (arg === '--year' && next) {
            options.year = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--from-ac' && next) {
            options.fromAc = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--max-ac' && next) {
            options.maxAc = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--out' && next) {
            options.outFile = next;
            index += 1;
            continue;
        }

        if (arg === '--delay-ms' && next) {
            options.delayMs = Number(next);
            index += 1;
        }
    }

    return options;
}

function validateOptions(options) {
    if (!/^S\d{2}$/i.test(options.stateCode)) {
        throw new Error('Missing or invalid --state. Example: --state S11');
    }

    if (!Number.isInteger(options.year) || options.year < 2000) {
        throw new Error('Missing or invalid --year. Example: --year 2026');
    }

    if (!Number.isInteger(options.fromAc) || options.fromAc < 1) {
        throw new Error('Missing or invalid --from-ac. Example: --from-ac 1');
    }

    if (!Number.isInteger(options.maxAc) || options.maxAc < options.fromAc) {
        throw new Error('Missing or invalid --max-ac. Example: --max-ac 140');
    }

    if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
        throw new Error('Missing or invalid --delay-ms. Example: --delay-ms 250');
    }
}

function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function extractFirstTruthy(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value === undefined || value === null) {
            continue;
        }

        const normalized = String(value).trim();
        if (normalized) {
            return normalized;
        }
    }

    return null;
}

function extractDistrictName(part) {
    return extractFirstTruthy(part, [
        'districtName',
        'districtNm',
        'distName',
        'distNm',
        'district',
    ]);
}

function extractConstituencyName(part) {
    return extractFirstTruthy(part, [
        'acName',
        'acname',
        'acNm',
        'assemblyName',
        'assemblyNm',
        'constituencyName',
        'constituencyNm',
        'constituency',
    ]);
}

function getRevisionNo(rollTypeRefId) {
    const match = String(rollTypeRefId).match(/-(\d+)$/);
    return match ? Number(match[1]) : 1;
}

function chooseRollType(rollTypes, stateCode, year) {
    const preferred = rollTypes.find((item) => item.rollTypeRefId?.startsWith(`${stateCode}-${year}-FIR`));
    if (preferred) {
        return preferred;
    }

    const finalRoll = rollTypes.find((item) => item.rollType === 'FinalRoll');
    if (finalRoll) {
        return finalRoll;
    }

    if (rollTypes.length === 0) {
        throw new Error(`No roll types returned by ECI for ${stateCode} ${year}`);
    }

    return rollTypes[0];
}

async function fetchRawPollingParts(stateCode, acNumber, rollTypeRefId, year) {
    const requestBody = {
        stateCd: stateCode,
        acNumber,
        rollTypeRefId,
        pdfGenType: 'EROLLGEN',
        revisionNo: getRevisionNo(rollTypeRefId),
        year,
    };

    const response = await axios.post(
        `${BASE_URL}/api/v1/printing-publish/get-publish-part-list`,
        requestBody,
        {
            headers: getHeaders(),
            timeout: 20000,
        },
    );

    const payload = Array.isArray(response.data?.payload) ? response.data.payload : [];
    return {
        status: response.data?.status,
        payload,
    };
}

async function exportStaticData(options) {
    const rollTypes = await getRollTypes(options.stateCode, options.year);
    const selectedRollType = chooseRollType(rollTypes, options.stateCode, options.year);
    const districts = new Map();
    const constituencies = [];
    const failures = [];

    console.log(`Using roll type: ${selectedRollType.rollTypeRefId} (${selectedRollType.name})`);

    for (let acNumber = options.fromAc; acNumber <= options.maxAc; acNumber += 1) {
        process.stdout.write(`\rScanning AC ${acNumber}/${options.maxAc} ...`);

        try {
            const result = await fetchRawPollingParts(
                options.stateCode,
                acNumber,
                selectedRollType.rollTypeRefId,
                options.year,
            );

            const firstPart = result.payload[0];
            if (!firstPart) {
                await sleep(options.delayMs);
                continue;
            }

            const districtCode = extractFirstTruthy(firstPart, ['districtCd', 'districtCode']);
            const districtName = extractDistrictName(firstPart);
            const constituencyName = extractConstituencyName(firstPart) || `ASSEMBLY CONSTITUENCY ${acNumber}`;
            const partCount = result.payload.length;

            if (!districtCode) {
                failures.push({ acNumber, reason: 'Missing district code in payload' });
                await sleep(options.delayMs);
                continue;
            }

            if (!districts.has(districtCode)) {
                districts.set(districtCode, {
                    code: districtCode,
                    name: districtName || districtCode,
                    constituencies: [],
                });
            }

            const constituency = {
                acNumber,
                value: String(acNumber),
                text: `${acNumber} - ${constituencyName}`,
                name: constituencyName,
                districtCode,
                districtName: districtName || districtCode,
                partCount,
            };

            districts.get(districtCode).constituencies.push(constituency);
            constituencies.push(constituency);
        } catch (error) {
            failures.push({ acNumber, reason: error.response?.data?.message || error.message });
        }

        await sleep(options.delayMs);
    }

    process.stdout.write('\n');

    const districtRows = Array.from(districts.values())
        .map((district) => ({
            ...district,
            constituencies: district.constituencies.sort((left, right) => left.acNumber - right.acNumber),
            constituencyCount: district.constituencies.length,
        }))
        .sort((left, right) => left.code.localeCompare(right.code));

    return {
        generatedAt: new Date().toISOString(),
        source: 'ECI gateway direct API',
        sourceUrl: `${BASE_URL}/api/v1/printing-publish/get-publish-part-list`,
        stateCode: options.stateCode,
        year: options.year,
        rollTypeRefId: selectedRollType.rollTypeRefId,
        rollTypeName: selectedRollType.name,
        range: {
            fromAc: options.fromAc,
            maxAc: options.maxAc,
        },
        totalConstituencies: constituencies.length,
        districtCount: districtRows.length,
        districts: districtRows,
        constituencies: constituencies.sort((left, right) => left.acNumber - right.acNumber),
        failures,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    validateOptions(options);

    const outFile = options.outFile || path.join('data', 'eci', `${options.stateCode}-${options.year}.json`);
    const exportData = await exportStaticData(options);

    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(exportData, null, 2));

    console.log(`Wrote ${exportData.totalConstituencies} constituencies across ${exportData.districtCount} districts to ${outFile}`);
    if (exportData.failures.length > 0) {
        console.log(`Skipped ${exportData.failures.length} AC numbers that did not return usable data`);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});