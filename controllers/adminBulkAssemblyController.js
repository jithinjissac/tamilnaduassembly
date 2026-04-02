import fs from 'fs';
import path from 'path';
import axios from 'axios';
import archiver from 'archiver';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import AdminBulkAssemblyJob from '../models/AdminBulkAssemblyJob.js';
import { logger } from '../utils/logger.js';
import { extractVoterSnippets } from '../utils/pdfSnippetExtractor.js';
import { saveVoterSnippetSlipsToFile } from '../utils/imageSlipGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeJobs = new Set();

function sanitizeFileName(input) {
    return String(input || 'unknown')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the direct ECI voter roll PDF URL without any API/captcha call.
 * URL pattern: https://voters.eci.gov.in/eroll/{year}/{state}/{rollTypePath}/rev{revision}/{acNo}/
 *              {year}-FC-EROLLGEN-{STATE}-{acNo}-{rollTypeFile}-Revision{revision}-MAL-{partNo}-WI.pdf
 */
function buildDirectEciPdfUrl(stateCode, year, rollType, acNumber, partNumber, revision = 2) {
    const refId = String(rollType || '');
    const revisionMatch = refId.match(/-(\d+)$/);
    const derivedRevision = revisionMatch ? Number(revisionMatch[1]) : revision;
    const normalizedRollType = 'SIR-FinalRoll';
    const stateUpper = stateCode.toUpperCase();
    const stateLower = stateCode.toLowerCase();
    const rollTypePath = normalizedRollType.toLowerCase();
    const acStr = String(acNumber);
    const partStr = String(partNumber);
    const fileName = `${year}-FC-EROLLGEN-${stateUpper}-${acStr}-${normalizedRollType}-Revision${derivedRevision}-MAL-${partStr}-WI.pdf`;
    return `https://voters.eci.gov.in/eroll/${year}/${stateLower}/${rollTypePath}/rev${derivedRevision}/${acStr}/${fileName}`;
}

function buildDirectEciPdfUrlCandidates(stateCode, year, rollType, acNumber, partNumber) {
    const refId = String(rollType || '');
    const revisionMatch = refId.match(/-(\d+)$/);
    const primaryRevision = revisionMatch ? Number(revisionMatch[1]) : 2;
    const candidateRevisions = [...new Set([primaryRevision, 2, 1])];

    return candidateRevisions.map((revision) =>
        buildDirectEciPdfUrl(stateCode, year, rollType, acNumber, partNumber, revision)
    );
}

async function downloadPdfWithRetry(pdfUrl, targetPath, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await axios.get(pdfUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    Accept: '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    Referer: 'https://voters.eci.gov.in/download-eroll?stateCode=S11',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
                }
            });

            fs.writeFileSync(targetPath, response.data);
            const stats = fs.statSync(targetPath);
            if (!stats.size) {
                throw new Error('Downloaded PDF is empty');
            }
            return;
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }
            await sleep(2000 * attempt);
        }
    }
}

async function downloadPdfFromCandidates(pdfUrls, targetPath) {
    let lastError = null;

    for (const pdfUrl of pdfUrls) {
        try {
            await downloadPdfWithRetry(pdfUrl, targetPath, 2);
            return pdfUrl;
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            if (status && status !== 404) {
                throw error;
            }
        }
    }

    const attemptedUrls = pdfUrls.join(' | ');
    const statusText = lastError?.response?.status ? `status ${lastError.response.status}` : (lastError?.message || 'download failed');
    throw new Error(`Direct PDF not found (${statusText}). Tried: ${attemptedUrls}`);
}

function launchBackgroundJob(jobId) {
    if (activeJobs.has(jobId)) return;
    activeJobs.add(jobId);

    setImmediate(async () => {
        try {
            await processBulkJob(jobId);
        } catch (error) {
            logger.error(`Bulk assembly job ${jobId} crashed:`, error);
        } finally {
            activeJobs.delete(jobId);
        }
    });
}

async function createZipArchive(zipFullPath, files) {
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFullPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);
        files.forEach((file) => {
            archive.file(file.fullPath, { name: file.fileName });
        });
        archive.finalize();
    });
}

async function ensureZipForCompletedJob(job, voterSlipDir) {
    if (job.zipFileName && job.zipFileUrl) {
        const existingZipPath = path.join(voterSlipDir, job.zipFileName);
        if (fs.existsSync(existingZipPath)) {
            return;
        }
    }

    const completedFiles = (job.parts || [])
        .filter((part) => part.status === 'completed' && part.slipFileName)
        .map((part) => ({
            fullPath: path.join(voterSlipDir, part.slipFileName),
            fileName: part.slipFileName
        }))
        .filter((file) => fs.existsSync(file.fullPath));

    if (!completedFiles.length) {
        return;
    }

    const zipFileName = `${sanitizeFileName(job.constituencyName)}-bulk-${Date.now()}.zip`;
    const zipFullPath = path.join(voterSlipDir, zipFileName);
    await createZipArchive(zipFullPath, completedFiles);
    job.zipFileName = zipFileName;
    job.zipFileUrl = `/voter-slips/${zipFileName}`;
}

// Max parts processed simultaneously. Each part spawns a Playwright Chromium
// instance (~300-500 MB RAM). For Railway Pro (24 vCPU / 24 GB RAM) 5 is a
// safe default; raise to 8 if you want to push harder.
const BULK_CONCURRENCY = 5;

/**
 * Run an array of async task factories with limited concurrency.
 * Returns results in the same order as tasks.
 */
async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let nextIdx = 0;

    async function worker() {
        while (nextIdx < tasks.length) {
            const i = nextIdx++;
            results[i] = await tasks[i]();
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

/**
 * Process a single polling part.
 * Uses atomic updateOne calls so concurrent workers never conflict on the
 * shared job document.
 */
async function processOnePart(jobId, jobMeta, part, voterSlipDir, pdfDownloadDir) {
    const { jobId: displayId, stateCode, year, rollType, constituencyCode,
            constituencyName, districtCode, candidate } = jobMeta;

    const pdfUrlCandidates = buildDirectEciPdfUrlCandidates(
        stateCode,
        year,
        rollType,
        constituencyCode,
        part.partNumber
    );
    const primaryPdfUrl = pdfUrlCandidates[0];
    const tempPdfPath = path.join(pdfDownloadDir,
        `bulk-${displayId}-${part.partNumber}-${Date.now()}.pdf`);

    // Mark part as processing
    await AdminBulkAssemblyJob.updateOne(
        { _id: jobId, 'parts.partNumber': part.partNumber },
        { $set: { 'parts.$.status': 'processing', 'parts.$.pdfUrl': primaryPdfUrl, 'parts.$.startedAt': new Date() } }
    );

    try {
        const resolvedPdfUrl = await downloadPdfFromCandidates(pdfUrlCandidates, tempPdfPath);

        const snippets = await extractVoterSnippets(tempPdfPath, {
            startPage: 3,
            skipLastPage: true,
            usePythonExtractor: true,
            allowJsFallback: true
        });

        if (!Array.isArray(snippets) || snippets.length === 0) {
            throw new Error('No voter snippets extracted from PDF');
        }

        const pollingStationInfo = `${part.partNumber}${part.partName ? ` - ${part.partName}` : ''}`;
        const slipInfo = await saveVoterSnippetSlipsToFile(snippets, {
            constituency: constituencyName,
            district: districtCode,
            stateCode,
            year,
            pollingStationInfo,
            candidate: {
                symbol: candidate?.symbol || '',
                symbolName: candidate?.symbolName || '',
                symbolNameMalayalam: candidate?.symbolNameMalayalam || ''
            }
        });

        if (!slipInfo?.pdfFullPath || !fs.existsSync(slipInfo.pdfFullPath)) {
            throw new Error('Slip PDF was not generated');
        }

        const safeConstituency = sanitizeFileName(constituencyName);
        const finalPdfFileName = `${String(part.partNumber).padStart(3, '0')}-${safeConstituency}-${Date.now()}.pdf`;
        const finalPdfFullPath = path.join(voterSlipDir, finalPdfFileName);
        fs.renameSync(slipInfo.pdfFullPath, finalPdfFullPath);

        await AdminBulkAssemblyJob.updateOne(
            { _id: jobId, 'parts.partNumber': part.partNumber },
            {
                $set: {
                    'parts.$.status': 'completed',
                    'parts.$.pdfUrl': resolvedPdfUrl,
                    'parts.$.voterCount': snippets.length,
                    'parts.$.slipFileName': finalPdfFileName,
                    'parts.$.slipFileUrl': `/voter-slips/${finalPdfFileName}`,
                    'parts.$.error': '',
                    'parts.$.completedAt': new Date()
                },
                $inc: { completedParts: 1 }
            }
        );

        logger.info(`✅ Bulk part ${part.partNumber} done — ${snippets.length} voters`);
        return { status: 'completed', fullPath: finalPdfFullPath, fileName: finalPdfFileName };
    } catch (error) {
        await AdminBulkAssemblyJob.updateOne(
            { _id: jobId, 'parts.partNumber': part.partNumber },
            {
                $set: {
                    'parts.$.status': 'failed',
                    'parts.$.error': error.message,
                    'parts.$.completedAt': new Date()
                },
                $inc: { failedParts: 1 }
            }
        );
        logger.error(`❌ Bulk part ${part.partNumber} failed: ${error.message}`);
        return { status: 'failed' };
    } finally {
        try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (_) {}
    }
}

async function processBulkJob(jobId) {
    const job = await AdminBulkAssemblyJob.findById(jobId);
    if (!job) return;

    const voterSlipDir = path.join(path.dirname(__dirname), 'voter-slips');
    const pdfDownloadDir = path.join(path.dirname(__dirname), 'pdf-downloads');
    ensureDir(voterSlipDir);
    ensureDir(pdfDownloadDir);

    job.status = 'running';
    job.startedAt = new Date();
    await job.save();

    try {
        const remainingParts = job.parts.filter((part) => part.status !== 'completed');

        if (!remainingParts.length) {
            await ensureZipForCompletedJob(job, voterSlipDir);
            job.completedParts = job.parts.filter((p) => p.status === 'completed').length;
            job.failedParts = job.parts.filter((p) => p.status === 'failed').length;
            job.status = job.failedParts > 0 ? 'partial' : 'completed';
            job.finishedAt = new Date();
            await job.save();
            return;
        }

        // Snapshot immutable metadata before launching concurrent workers
        const jobMeta = {
            jobId: job.jobId,
            stateCode: job.stateCode,
            year: job.year,
            rollType: job.rollType,
            constituencyCode: job.constituencyCode,
            constituencyName: job.constituencyName,
            districtCode: job.districtCode,
            candidate: job.candidate
        };

        const tasks = remainingParts.map((part) => () =>
            processOnePart(jobId, jobMeta, part, voterSlipDir, pdfDownloadDir)
        );

        logger.info(`🚀 Processing ${tasks.length} parts with concurrency ${BULK_CONCURRENCY}`);
        await runWithConcurrency(tasks, BULK_CONCURRENCY);

        // Reload fresh doc — concurrent $inc writes are now all flushed
        const freshJob = await AdminBulkAssemblyJob.findById(jobId);
        if (!freshJob) return;

        await ensureZipForCompletedJob(freshJob, voterSlipDir);

        freshJob.status = freshJob.failedParts > 0
            ? (freshJob.completedParts > 0 ? 'partial' : 'failed')
            : 'completed';
        freshJob.finishedAt = new Date();
        await freshJob.save();
    } catch (error) {
        logger.error(`Bulk job ${jobId} outer error: ${error.message}`);
        await AdminBulkAssemblyJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            error: error.message,
            finishedAt: new Date()
        });
    }
}

export const createBulkAssemblyJob = async (req, res) => {
    try {
        const {
            stateCode,
            districtCode,
            constituencyCode,
            constituencyName,
            year,
            rollType,
            language = 'en',
            selectedParts = [],
            candidate = {}
        } = req.body;

        if (!stateCode || !districtCode || !constituencyCode || !constituencyName || !year || !rollType) {
            return res.status(400).json({
                status: 'error',
                message: 'stateCode, districtCode, constituencyCode, constituencyName, year, rollType are required'
            });
        }

        if (!Array.isArray(selectedParts) || selectedParts.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'selectedParts is required and must contain at least one polling part'
            });
        }

        const parts = selectedParts
            .map((part) => ({
                partNumber: Number(part.partNumber),
                partName: String(part.partName || ''),
                status: 'pending'
            }))
            .filter((part) => Number.isFinite(part.partNumber));

        if (!parts.length) {
            return res.status(400).json({
                status: 'error',
                message: 'selectedParts must include valid partNumber values'
            });
        }

        const job = await AdminBulkAssemblyJob.create({
            createdBy: req.userId,
            stateCode,
            districtCode,
            constituencyCode: String(constituencyCode),
            constituencyName,
            year: String(year),
            rollType,
            language,
            parts,
            candidate: {
                symbol: String(candidate.symbol || ''),
                symbolName: String(candidate.symbolName || ''),
                symbolNameMalayalam: String(candidate.symbolNameMalayalam || '')
            }
        });

        launchBackgroundJob(job._id.toString());

        res.status(202).json({
            status: 'success',
            message: 'Bulk assembly job queued',
            jobId: job.jobId,
            id: job._id
        });
    } catch (error) {
        logger.error('Create bulk assembly job failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create bulk assembly job',
            error: error.message
        });
    }
};

export const resumePendingBulkAssemblyJobs = async () => {
    const resumableJobs = await AdminBulkAssemblyJob.find({
        status: { $in: ['queued', 'running'] }
    });

    if (!resumableJobs.length) {
        logger.info('No queued/running bulk assembly jobs to resume');
        return;
    }

    for (const job of resumableJobs) {
        let changed = false;
        for (const part of job.parts) {
            if (part.status === 'processing') {
                part.status = 'pending';
                part.error = 'Reset to pending after server restart';
                changed = true;
            }
        }

        job.status = 'queued';
        job.error = '';
        if (changed) {
            job.markModified('parts');
        }
        await job.save();
        launchBackgroundJob(job._id.toString());
    }

    logger.info(`Resumed ${resumableJobs.length} bulk assembly job(s) after startup`);
};

export const listBulkAssemblyJobs = async (req, res) => {
    try {
        const jobs = await AdminBulkAssemblyJob.find({})
            .sort({ createdAt: -1 })
            .limit(30)
            .select('jobId status constituencyName totalParts completedParts failedParts zipFileUrl createdAt startedAt finishedAt')
            .lean();

        res.json({
            status: 'success',
            jobs
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to list bulk jobs',
            error: error.message
        });
    }
};

export const getBulkAssemblyJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const query = mongoose.Types.ObjectId.isValid(jobId)
            ? { $or: [{ _id: jobId }, { jobId }] }
            : { jobId };
        const job = await AdminBulkAssemblyJob.findOne(query).lean();

        if (!job) {
            return res.status(404).json({
                status: 'error',
                message: 'Bulk job not found'
            });
        }

        res.json({
            status: 'success',
            job
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get bulk job',
            error: error.message
        });
    }
};

export const downloadBulkAssemblyZip = async (req, res) => {
    try {
        const { jobId } = req.params;
        const query = mongoose.Types.ObjectId.isValid(jobId)
            ? { $or: [{ _id: jobId }, { jobId }] }
            : { jobId };
        const job = await AdminBulkAssemblyJob.findOne(query).lean();

        if (!job || !job.zipFileName) {
            return res.status(404).json({
                status: 'error',
                message: 'Bulk ZIP not ready'
            });
        }

        const zipPath = path.join(path.dirname(__dirname), 'voter-slips', job.zipFileName);
        if (!fs.existsSync(zipPath)) {
            return res.status(404).json({
                status: 'error',
                message: 'ZIP file missing on server'
            });
        }

        return res.download(zipPath, job.zipFileName);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to download ZIP',
            error: error.message
        });
    }
};