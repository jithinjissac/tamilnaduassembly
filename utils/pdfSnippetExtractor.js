/**
 * PDF Snippet Extractor - Extract voter sections as images
 * No OCR needed - preserves exact visual appearance
 */

import { pdfToPng } from 'pdf-to-png-converter';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from './logger.js';
import pdf from 'pdf-parse';
import { Jimp } from 'jimp';

function isLikelyVoterSnippet(image) {
    const { data, width, height } = image.bitmap;
    const totalPixels = width * height;

    if (!totalPixels) {
        return { valid: false, reason: 'empty-image' };
    }

    let inkPixels = 0;
    let centerInkPixels = 0;
    let darkPixels = 0;
    let edgeTransitions = 0;
    let edgeSamples = 0;
    let topEdgeDark = 0;
    let bottomEdgeDark = 0;
    let leftEdgeDark = 0;
    let rightEdgeDark = 0;
    let topBandInk = 0;
    let middleBandInk = 0;
    let bottomBandInk = 0;
    let leftBandInk = 0;
    let rightBandInk = 0;
    let photoPanelInk = 0;

    const centerXStart = Math.floor(width * 0.1);
    const centerXEnd = Math.ceil(width * 0.9);
    const centerYStart = Math.floor(height * 0.1);
    const centerYEnd = Math.ceil(height * 0.9);
    const borderBandX = Math.max(1, Math.floor(width * 0.02));
    const borderBandY = Math.max(1, Math.floor(height * 0.02));
    const topBandEnd = Math.max(1, Math.floor(height * 0.24));
    const bottomBandStart = Math.max(0, Math.floor(height * 0.76));
    const leftBandEnd = Math.max(1, Math.floor(width * 0.4));
    const rightBandStart = Math.max(0, Math.floor(width * 0.6));
    const photoPanelXStart = Math.max(0, Math.floor(width * 0.72));
    const photoPanelXEnd = Math.min(width, Math.ceil(width * 0.985));
    const photoPanelYStart = Math.max(0, Math.floor(height * 0.2));
    const photoPanelYEnd = Math.min(height, Math.ceil(height * 0.94));

    for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
            const idx = rowOffset + x * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Perceived luminance
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            if (luma < 245) inkPixels++;
            if (luma < 90) darkPixels++;

            if (luma < 245) {
                if (y < topBandEnd) {
                    topBandInk++;
                } else if (y >= bottomBandStart) {
                    bottomBandInk++;
                } else {
                    middleBandInk++;
                }

                if (x < leftBandEnd) {
                    leftBandInk++;
                }
                if (x >= rightBandStart) {
                    rightBandInk++;
                }
                if (x >= photoPanelXStart && x < photoPanelXEnd && y >= photoPanelYStart && y < photoPanelYEnd) {
                    photoPanelInk++;
                }
            }

            if (luma < 120) {
                if (y < borderBandY) topEdgeDark++;
                if (y >= height - borderBandY) bottomEdgeDark++;
                if (x < borderBandX) leftEdgeDark++;
                if (x >= width - borderBandX) rightEdgeDark++;
            }

            if (x >= centerXStart && x < centerXEnd && y >= centerYStart && y < centerYEnd && luma < 245) {
                centerInkPixels++;
            }

            // Simple local edge/activity estimate (horizontal only)
            if (x > 0) {
                const prevIdx = idx - 4;
                const pr = data[prevIdx];
                const pg = data[prevIdx + 1];
                const pb = data[prevIdx + 2];
                const prevLuma = 0.299 * pr + 0.587 * pg + 0.114 * pb;
                if (Math.abs(luma - prevLuma) > 20) {
                    edgeTransitions++;
                }
                edgeSamples++;
            }
        }
    }

    const centerPixels = Math.max((centerXEnd - centerXStart) * (centerYEnd - centerYStart), 1);
    const topBandPixels = Math.max(width * topBandEnd, 1);
    const middleBandPixels = Math.max(width * Math.max(bottomBandStart - topBandEnd, 1), 1);
    const bottomBandPixels = Math.max(width * Math.max(height - bottomBandStart, 1), 1);
    const leftBandPixels = Math.max(height * leftBandEnd, 1);
    const rightBandPixels = Math.max(height * Math.max(width - rightBandStart, 1), 1);
    const photoPanelPixels = Math.max((photoPanelXEnd - photoPanelXStart) * (photoPanelYEnd - photoPanelYStart), 1);
    const inkRatio = inkPixels / totalPixels;
    const centerInkRatio = centerInkPixels / centerPixels;
    const darkRatio = darkPixels / totalPixels;
    const edgeRatio = edgeSamples > 0 ? edgeTransitions / edgeSamples : 0;
    const topBandInkRatio = topBandInk / topBandPixels;
    const middleBandInkRatio = middleBandInk / middleBandPixels;
    const bottomBandInkRatio = bottomBandInk / bottomBandPixels;
    const leftBandInkRatio = leftBandInk / leftBandPixels;
    const rightBandInkRatio = rightBandInk / rightBandPixels;
    const photoPanelInkRatio = photoPanelInk / photoPanelPixels;
    const topEdgeRatio = topEdgeDark / Math.max(width * borderBandY, 1);
    const bottomEdgeRatio = bottomEdgeDark / Math.max(width * borderBandY, 1);
    const leftEdgeRatio = leftEdgeDark / Math.max(height * borderBandX, 1);
    const rightEdgeRatio = rightEdgeDark / Math.max(height * borderBandX, 1);
    const borderEdgesDetected = [topEdgeRatio, bottomEdgeRatio, leftEdgeRatio, rightEdgeRatio].filter(v => v >= 0.06).length;
    const horizontalBandsWithInk = [topBandInkRatio, middleBandInkRatio, bottomBandInkRatio].filter(v => v >= 0.02).length;

    const valid = (
        inkRatio >= 0.03 &&
        centerInkRatio >= 0.015 &&
        darkRatio >= 0.0025 &&
        edgeRatio >= 0.01 &&
        borderEdgesDetected >= 2 &&
        topBandInkRatio >= 0.035 &&
        middleBandInkRatio >= 0.02 &&
        horizontalBandsWithInk >= 2 &&
        leftBandInkRatio >= 0.02 &&
        rightBandInkRatio >= 0.012 &&
        inkRatio <= 0.9
    );

    return {
        valid,
        reason: valid ? 'ok' : 'low-content',
        metrics: {
            inkRatio,
            centerInkRatio,
            darkRatio,
            edgeRatio,
            topBandInkRatio,
            middleBandInkRatio,
            bottomBandInkRatio,
            leftBandInkRatio,
            rightBandInkRatio,
            photoPanelInkRatio,
            horizontalBandsWithInk,
            topEdgeRatio,
            bottomEdgeRatio,
            leftEdgeRatio,
            rightEdgeRatio,
            borderEdgesDetected
        }
    };
}

function filterSnippetsByPageDensity(snippets, minValidSnippetsPerPage = 15) {
    if (!Array.isArray(snippets) || snippets.length === 0) {
        return { filtered: [], droppedPages: 0 };
    }

    const byPage = new Map();
    for (const snippet of snippets) {
        const pageKey = snippet.page ?? 'unknown';
        if (!byPage.has(pageKey)) {
            byPage.set(pageKey, []);
        }
        byPage.get(pageKey).push(snippet);
    }

    const kept = [];
    let droppedPages = 0;

    for (const [, pageSnippets] of byPage.entries()) {
        if (pageSnippets.length >= minValidSnippetsPerPage) {
            kept.push(...pageSnippets);
        } else {
            droppedPages++;
        }
    }

    kept.sort((a, b) => {
        const pa = Number.isFinite(a.page) ? a.page : Number.MAX_SAFE_INTEGER;
        const pb = Number.isFinite(b.page) ? b.page : Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        const ba = Number.isFinite(a.box) ? a.box : Number.MAX_SAFE_INTEGER;
        const bb = Number.isFinite(b.box) ? b.box : Number.MAX_SAFE_INTEGER;
        if (ba !== bb) return ba - bb;
        return (a.serialNo || 0) - (b.serialNo || 0);
    });

    for (let i = 0; i < kept.length; i++) {
        kept[i].serialNo = i + 1;
    }

    return { filtered: kept, droppedPages };
}

function dropSparseLeadingPage(snippets, expectedStartPage, minSnippets = 4) {
    if (!Array.isArray(snippets) || snippets.length === 0) {
        return snippets;
    }

    const normalizePage = (value) => {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const byPage = new Map();
    for (const snippet of snippets) {
        const pageKey = normalizePage(snippet.page);
        if (pageKey == null) continue;
        if (!byPage.has(pageKey)) byPage.set(pageKey, []);
        byPage.get(pageKey).push(snippet);
    }

    const leadingPageSnippets = byPage.get(expectedStartPage) || [];
    if (leadingPageSnippets.length >= minSnippets) {
        return snippets;
    }

    if (leadingPageSnippets.length > 0) {
        logger.info(
            `Dropping sparse leading page ${expectedStartPage} (${leadingPageSnippets.length} snippets) and continuing from next page`
        );
    }

    return snippets.filter((snippet) => normalizePage(snippet.page) !== expectedStartPage);
}

function dropSparseSpecificPage(snippets, pageNumber, minSnippets) {
    if (!Array.isArray(snippets) || snippets.length === 0) {
        return snippets;
    }

    const normalizePage = (value) => {
        const parsed = Number.parseInt(String(value ?? ''), 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const pageSnippets = snippets.filter((snippet) => normalizePage(snippet.page) === pageNumber);
    if (pageSnippets.length === 0 || pageSnippets.length >= minSnippets) {
        return snippets;
    }

    logger.info(
        `Dropping page ${pageNumber} snippets because count is ${pageSnippets.length} (< ${minSnippets})`
    );
    return snippets.filter((snippet) => normalizePage(snippet.page) !== pageNumber);
}

function runCommand(command, args = []) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { shell: false });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });

        proc.on('error', (err) => {
            resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
        });
    });
}

async function shouldSkipFirstThreePages(pdfPath, pageNum = 2) {
    try {
        const pngPages = await pdfToPng(pdfPath, {
            disableFontFace: false,
            useSystemFonts: false,
            viewportScale: 1.0,
            pagesToProcess: [pageNum],
            strictPagesToProcess: false,
            verbosityLevel: 0
        });

        if (!pngPages || pngPages.length === 0) {
            return false;
        }

        const image = await Jimp.read(pngPages[0].content);
        const { data, width, height } = image.bitmap;
        const totalPixels = Math.max(width * height, 1);

        let inkPixels = 0;
        // Sample every 2nd pixel for speed; enough for whitespace heuristic.
        for (let y = 0; y < height; y += 2) {
            const rowOffset = y * width * 4;
            for (let x = 0; x < width; x += 2) {
                const idx = rowOffset + x * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                if (luma < 245) inkPixels++;
            }
        }

        const sampledTotal = Math.max(Math.ceil(totalPixels / 4), 1);
        const inkRatio = inkPixels / sampledTotal;
        const shouldSkip = inkRatio <= 0.08;

        logger.info(
            `Page ${pageNum} overflow check: inkRatio=${inkRatio.toFixed(4)} => ${shouldSkip ? 'skip first 3 pages' : 'use normal start page'}`
        );

        return shouldSkip;
    } catch (error) {
        logger.warn(`Overflow page detection failed: ${error.message}`);
        return false;
    }
}

async function tryPythonBoxExtractor(pdfPath, startPage, endPage, outputDir, dpi = 450, threads = 4, pngCompression = 1) {
    const scriptPath = path.join(process.cwd(), 'python-ocr', 'extract_voter_boxes.py');
    if (!fs.existsSync(scriptPath)) {
        logger.warn('Python box extractor script not found');
        return null;
    }

    const baseArgs = [
        scriptPath,
        '--pdf', pdfPath,
        '--output', outputDir,
        '--dpi', String(dpi),
        '--start-page', String(startPage),
        '--end-page', String(endPage || 0),
        '--threads', String(threads),
        '--png-compression', String(pngCompression)
    ];

    let result = await runCommand('python3', baseArgs);
    if (result.code !== 0) {
        logger.warn(`python3 command failed: ${result.stderr}`);
        result = await runCommand('python', baseArgs);
    }
    if (result.code !== 0) {
        logger.warn(`python command failed: ${result.stderr}`);
        result = await runCommand('py', baseArgs);
    }

    if (result.code !== 0) {
        logger.warn(`Python extractor failed. stderr: ${result.stderr}`);
        return null;
    }

    logger.info(`Python extractor output: ${result.stdout.trim()}`);
    const files = fs.readdirSync(outputDir)
        .filter(f => f.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
        logger.warn('Python extractor finished but no box images found');
        return null;
    }

    const snippets = [];
    for (let i = 0; i < files.length; i++) {
        const fileName = files[i];
        const snippetPath = path.join(outputDir, fileName);
        const imageBuffer = fs.readFileSync(snippetPath);

        const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        const pageMatch = fileName.match(/_p(\d{4})_b(\d{2})\.png$/i);
        const page = pageMatch ? parseInt(pageMatch[1], 10) : null;
        const box = pageMatch ? parseInt(pageMatch[2], 10) : null;

        snippets.push({
            serialNo: i + 1,
            snippetPath,
            snippetBase64: base64,
            page,
            row: null,
            col: null,
            box
        });
    }

    // Keep remainder pages (often 1-7 voters on second-last/last page) from Python output.
    const withoutSparseLeadingPage = dropSparseLeadingPage(snippets, startPage, 3);
    const withoutSparsePage3 = dropSparseSpecificPage(withoutSparseLeadingPage, 3, 3);
    const { filtered, droppedPages } = filterSnippetsByPageDensity(withoutSparsePage3, 1);
    if (droppedPages > 0) {
        logger.info(`Python extractor dropped ${droppedPages} low-density page(s)`);
    }

    return filtered;
}

/**
 * Check if PDF is text-based or image-based
 */
export async function checkPDFType(pdfPath) {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    const textPerPage = data.text.length / data.numpages;
    const isImageBased = textPerPage < 100;
    
    logger.info(`PDF Type Check: ${isImageBased ? 'IMAGE-BASED' : 'TEXT-BASED'}`);
    logger.info(`Text per page: ${textPerPage.toFixed(0)} characters`);
    
    return {
        isImageBased,
        pages: data.numpages,
        textLength: data.text.length,
        textPerPage
    };
}

/**
 * Extract voter snippets from PDF pages
 * ECI format: 3 voters per row, approximately 8 rows per page = 24 voters/page
 */
export async function extractVoterSnippets(pdfPath, options = {}) {
    try {
        const pdfInfo = await checkPDFType(pdfPath);
        const onSnippetExtracted = typeof options.onSnippetExtracted === 'function'
            ? options.onSnippetExtracted
            : null;
        const onPageProgress = typeof options.onPageProgress === 'function'
            ? options.onPageProgress
            : null;

        const configuredStartPage = options.startPage || 3; // Skip header pages
        const autoAdjustStartPage = options.autoAdjustStartPage !== false;
        let startPage = configuredStartPage;

        // Some PDFs have page-1 overflow into page 2; in those files voter pages start from page 4.
        if (autoAdjustStartPage && configuredStartPage === 3 && pdfInfo.pages >= 4) {
            const skipThree = await shouldSkipFirstThreePages(pdfPath, 2);
            if (skipThree) {
                startPage = 4;
            }
        }

        const maxPages = Number.isFinite(options.maxPages) ? options.maxPages : null;
        const skipLastPage = options.skipLastPage === true;
        const lastProcessablePage = skipLastPage
            ? Math.max(1, pdfInfo.pages - 1)
            : Math.max(1, pdfInfo.pages);
        const endPage = maxPages
            ? Math.min(startPage + maxPages - 1, lastProcessablePage)
            : lastProcessablePage;

        logger.info(`Extracting voter snippets from ${pdfInfo.pages} pages${skipLastPage ? ' (skipping last page)' : ''}...`);

        if (endPage < startPage) {
            logger.warn(`No processable pages for extraction (startPage=${startPage}, totalPages=${pdfInfo.pages}, skipLastPage=${skipLastPage})`);
            return [];
        }
        
        const outputDir = path.join(path.dirname(pdfPath), 'voter-snippets');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Prefer Python contour-based extractor (best quality for ECI PDFs).
        // If Python script is missing, automatically use JS fallback.
        const pythonScriptPath = path.join(process.cwd(), 'python-ocr', 'extract_voter_boxes.py');
        const hasPythonExtractor = fs.existsSync(pythonScriptPath);
        const usePythonExtractor = options.usePythonExtractor !== false && hasPythonExtractor;
        const allowJsFallback = options.allowJsFallback === true || !hasPythonExtractor;
        const extractDpi = Number.isFinite(options.extractDpi) ? options.extractDpi : 450;
        const pythonThreads = Number.isFinite(options.pythonThreads) ? options.pythonThreads : 4;
        const pngCompression = Number.isFinite(options.pngCompression) ? options.pngCompression : 1;

        if (!hasPythonExtractor) {
            logger.warn('Python extractor script missing; using JS fallback extractor');
        }

        if (usePythonExtractor) {
            const pythonOutputDir = path.join(outputDir, `python-boxes-${Date.now()}`);
            fs.mkdirSync(pythonOutputDir, { recursive: true });

            // Attach the pythonOutputDir to options for downstream consumers (e.g., imageSlipGenerator)
            if (options && typeof options === 'object') {
                options.pythonBoxesDir = pythonOutputDir;
            }

            const pythonSnippets = await tryPythonBoxExtractor(
                pdfPath,
                startPage,
                endPage,
                pythonOutputDir,
                extractDpi,
                pythonThreads,
                pngCompression
            );

            if (pythonSnippets && pythonSnippets.length > 0) {
                if (onSnippetExtracted || onPageProgress) {
                    for (let i = 0; i < pythonSnippets.length; i++) {
                        const snippet = pythonSnippets[i];
                        if (onSnippetExtracted) {
                            onSnippetExtracted({
                                totalExtracted: i + 1,
                                page: snippet.page,
                                pageExtracted: null,
                                pageProgress: null,
                                totalPages: (endPage - startPage + 1)
                            });
                        }
                    }
                    if (onPageProgress) {
                        onPageProgress({
                            currentPage: endPage,
                            totalPages: (endPage - startPage + 1),
                            totalExtracted: pythonSnippets.length
                        });
                    }
                }
                const normalizedSnippets = dropSparseSpecificPage(pythonSnippets, 3, 3);
                logger.info(`Using Python contour extractor output: ${normalizedSnippets.length} snippets`);
                return normalizedSnippets;
            }

            if (!allowJsFallback) {
                throw new Error('Python voter-box extractor failed or returned no boxes. JS fallback disabled.');
            }
        }

        const allVoterSnippets = [];
        let filteredLowContent = 0;
        let voterCounter = 1;
        const totalPages = Math.max(1, endPage - startPage + 1);
        
        // Process each page
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            logger.info(`Processing page ${pageNum}/${endPage}...`);
            
            // Convert page to high-res image
            const pngPages = await pdfToPng(pdfPath, {
                disableFontFace: false,
                useSystemFonts: false,
                viewportScale: 2.0, // High resolution
                pagesToProcess: [pageNum],
                strictPagesToProcess: false,
                verbosityLevel: 0
            });
            
            if (!pngPages || pngPages.length === 0) {
                logger.warn(`Failed to convert page ${pageNum}`);
                continue;
            }
            
            // Load image with Jimp
            const pageImage = await Jimp.read(pngPages[0].content);
            const pageWidth = pageImage.bitmap.width;
            const pageHeight = pageImage.bitmap.height;
            
            logger.info(`Page ${pageNum} size: ${pageWidth}x${pageHeight}`);
            
            // ECI format layout (full voter grid):
            // - 3 columns
            // - 10 rows (up to 30 voter boxes/page)
            // - Adaptive row sizing to fit complete content area
            
            // Scale factors for different resolutions (based on 1190x1684 reference)
            const scale = pageWidth / 1190;
            
            // Actual border positions from layout analysis
            const leftMargin = Math.round(28 * scale);
            const col1Start = leftMargin;
            const col1End = Math.round(307 * scale);
            const col2Start = Math.round(389 * scale);
            const col2End = Math.round(687 * scale);
            const col3Start = Math.round(769 * scale);
            const col3End = Math.round(1067 * scale);
            
            // First voter row starts after header area
            const firstRowStart = Math.round(204 * scale);

            // Use bottom margin to fit all 10 rows reliably across page sizes
            const bottomMargin = Math.round(90 * scale);
            const lastRowBottom = pageHeight - bottomMargin;

            const rows = options.rows || 10; // Full 3x10 voter grid
            const cols = 3; // 3 voters per row
            const rowHeight = Math.floor((lastRowBottom - firstRowStart) / rows);

            if (rowHeight <= 0) {
                logger.warn(`Invalid row height calculated for page ${pageNum}, skipping page`);
                continue;
            }
            
            // Column definitions (including borders)
            const columnPositions = [
                { x: col1Start, width: col1End - col1Start },
                { x: col2Start, width: col2End - col2Start },
                { x: col3Start, width: col3End - col3Start }
            ];
            
            // Extract each voter section WITH borders
            const pageSnippets = [];
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const x = columnPositions[col].x;
                    const y = firstRowStart + (row * rowHeight);
                    const width = columnPositions[col].width;
                    const height = rowHeight - 2; // Tiny adjustment to avoid overlap
                    
                    // Skip if dimensions are invalid
                    if (x + width > pageWidth || y + height > pageHeight) {
                        continue;
                    }
                    
                    try {
                        // Extract voter section (Jimp 1.x crop syntax)
                        const voterSnippet = pageImage.clone()
                            .crop({ x, y, w: width, h: height });

                        const quality = isLikelyVoterSnippet(voterSnippet);
                        if (!quality.valid) {
                            filteredLowContent++;
                            continue;
                        }
                        
                        // Save as PNG
                        const snippetPath = path.join(outputDir, `voter-${voterCounter}.png`);
                        await voterSnippet.write(snippetPath);
                        
                        // Get base64 for embedding in HTML
                        const mimeType = 'image/png';
                        const base64 = `data:${mimeType};base64,${(await voterSnippet.getBuffer(mimeType)).toString('base64')}`;
                        
                        pageSnippets.push({
                            serialNo: voterCounter,
                            snippetPath: snippetPath,
                            snippetBase64: base64,
                            page: pageNum,
                            row: row,
                            col: col
                        });

                        if (onSnippetExtracted) {
                            onSnippetExtracted({
                                totalExtracted: allVoterSnippets.length + pageSnippets.length,
                                page: pageNum,
                                pageExtracted: pageSnippets.length,
                                pageProgress: (pageNum - startPage) / totalPages,
                                totalPages
                            });
                        }
                        
                        voterCounter++;
                    } catch (err) {
                        logger.error(`Failed to extract snippet ${voterCounter}:`, err.message);
                    }
                }
            }

            if (pageSnippets.length >= 15) {
                allVoterSnippets.push(...pageSnippets);
            } else {
                filteredLowContent += pageSnippets.length;
                logger.info(`Dropping page ${pageNum} due to low valid snippet count (${pageSnippets.length})`);
            }

            if (onPageProgress) {
                onPageProgress({
                    currentPage: pageNum,
                    totalPages,
                    totalExtracted: allVoterSnippets.length,
                    pageExtracted: pageSnippets.length,
                    pageProgress: (pageNum - startPage + 1) / totalPages
                });
            }
            
            logger.info(`Page ${pageNum} complete: extracted ${rows * cols} snippets`);
        }
        if (filteredLowContent > 0) {
            logger.info(`Filtered ${filteredLowContent} blank/non-voter snippets during JS extraction`);
        }
        
        const normalizedSnippets = dropSparseSpecificPage(allVoterSnippets, 3, 3);
        logger.info(`Total voter snippets extracted: ${normalizedSnippets.length}`);
        
        return normalizedSnippets;
        
    } catch (error) {
        logger.error('Snippet extraction failed:', error);
        throw error;
    }
}

export default {
    extractVoterSnippets,
    checkPDFType
};
