import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import TnData from '../models/TnData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas';
const TN_SOURCE_FILE = path.join(__dirname, '..', 'data', 'eci', 'eci-s22-district-constituency-mapping.json');

const parseSource = () => {
    if (!fs.existsSync(TN_SOURCE_FILE)) {
        throw new Error(`TN source file not found: ${TN_SOURCE_FILE}`);
    }

    const raw = fs.readFileSync(TN_SOURCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.districts)) {
        throw new Error('Invalid TN source format: expected districts array');
    }

    return parsed;
};

const buildBulkOps = (source) => {
    const stateCode = String(source.stateCode || 'S22');
    const stateName = String(source.stateName || 'Tamil Nadu');
    const year = Number.isFinite(Number(source.year)) ? Number(source.year) : null;
    const rollTypeValue = source.rollTypeValue ? String(source.rollTypeValue) : null;

    const ops = [];

    for (const district of source.districts) {
        const districtCode = String(district?.districtCode || '').trim();
        const districtName = String(district?.districtName || '').trim();
        const constituencies = Array.isArray(district?.constituencies) ? district.constituencies : [];

        if (!districtCode || !districtName) {
            continue;
        }

        for (const constituency of constituencies) {
            const constituencyCode = String(constituency?.value || '').trim();
            const constituencyNumber = Number.isFinite(Number(constituency?.acNumber))
                ? Number(constituency.acNumber)
                : (Number.isFinite(Number(constituency?.value)) ? Number(constituency.value) : null);
            const constituencyName = String(constituency?.acName || '').trim();
            const constituencyLabel = String(constituency?.text || '').trim();

            if (!constituencyCode || !constituencyName) {
                continue;
            }

            ops.push({
                updateOne: {
                    filter: {
                        stateCode,
                        districtCode,
                        constituencyCode
                    },
                    update: {
                        $set: {
                            stateCode,
                            stateName,
                            year,
                            rollTypeValue,
                            districtCode,
                            districtName,
                            constituencyCode,
                            constituencyNumber,
                            constituencyName,
                            constituencyLabel,
                            source: 'ECI S22 Mapping',
                            metadata: {
                                generatedAt: source.generatedAt || null,
                                totalConstituencies: source.totalConstituencies || null
                            },
                            isActive: true
                        }
                    },
                    upsert: true
                }
            });
        }
    }

    return ops;
};

const seedTamilNaduData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const source = parseSource();
        const ops = buildBulkOps(source);

        if (!ops.length) {
            console.log('No valid TN rows found in source JSON.');
            process.exit(0);
        }

        const result = await TnData.bulkWrite(ops, { ordered: false });

        const totalRows = await TnData.countDocuments({ stateCode: 'S22', isActive: true });

        console.log('TN data seed completed.');
        console.log(`Inserted: ${result.upsertedCount || 0}`);
        console.log(`Updated: ${result.modifiedCount || 0}`);
        console.log(`Active S22 rows in collection: ${totalRows}`);

        process.exit(0);
    } catch (error) {
        console.error('Failed to seed TN data:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
};

seedTamilNaduData();

