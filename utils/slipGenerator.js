import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Generate HTML for assembly voter slips matching local body election format
 * Uses 5 slips per page layout with Malayalam labels
 */
export const generateVoterSlips = (voters, metadata = {}) => {
    const { constituency, district, stateCode, year } = metadata;
    
    // Use 5 slips per page to match local body election format
    const slipsPerPage = 5;
    
    // Font size settings for 5 slips per page (matching slipController.js defaults)
    const fontSize = {
        wardInfo: '10pt',
        slipNumber: '11pt',
        secId: '10pt',
        voterName: '11pt',
        infoRow: '10pt',
        infoLabel: '17mm',
        pollingStation: '10pt',
        wardMarginBottom: '1mm',
        wardPadding: '0mm 0mm 0mm 0mm',
        headerMarginBottom: '1mm',
        headerMarginTop: '0mm',
        voterNameMarginBottom: '1mm',
        infoRowMarginBottom: '0.8mm'
    };
    
    // Slip dimensions for 5 slips per page
    const slipHeight = '52mm';
    const slipGap = '4mm';

    let html = `
<!DOCTYPE html>
<html lang="ml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Assembly Voter Slips - ${constituency}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Noto Sans Malayalam', 'Noto Sans', Arial, sans-serif; background: #fff; }
        
        .page { 
            width: 210mm; 
            height: 297mm; 
            padding: 5mm 10mm; 
            display: flex; 
            flex-direction: column; 
            page-break-after: always; 
        }
        .page:last-child { page-break-after: auto; }
        
        .voter-slip { 
            width: 100%; 
            height: ${slipHeight}; 
            border: 2px solid #000; 
            display: grid; 
            grid-template-columns: 35mm 1fr; 
            gap: 0; 
            padding: 2mm; 
            position: relative; 
            flex-shrink: 0; 
            margin-bottom: ${slipGap}; 
        }
        .voter-slip::after { 
            content: ''; 
            position: absolute; 
            left: 0; 
            right: 0; 
            bottom: -${parseInt(slipGap)/2}mm; 
            height: 0; 
            border-bottom: 2px dashed #999; 
        }
        .voter-slip:last-child { margin-bottom: 0; }
        .voter-slip:last-child::after { display: none; }
        .voter-slip > * { overflow: hidden; }
        
        .slip-left { 
            display: flex !important; 
            width: 35mm; 
            border-right: 2px solid #000; 
            background: #fff; 
            margin-right: 0; 
            padding: 2mm; 
        }
        
        .slip-left-content { 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            width: 100%; 
        }
        
        .serial-label { 
            font-size: 12pt; 
            font-weight: 700; 
            color: #000; 
            margin-bottom: 1mm; 
            text-align: center; 
            line-height: 1.2; 
        }
        
        .serial-value { 
            font-size: 20pt; 
            font-weight: 800; 
            color: #000; 
            text-align: center; 
            line-height: 1; 
        }
        
        .slip-right { 
            flex: 1; 
            margin-left: 0; 
            padding: 1mm 2mm; 
            display: flex; 
            flex-direction: column; 
            justify-content: space-between; 
            overflow: hidden; 
            min-width: 0; 
        }
        
        .ward-info { 
            font-size: 11pt; 
            font-weight: bold; 
            margin-bottom: 0mm; 
            padding: 0mm 0 0.2mm 0; 
            border-bottom: 1px solid #000; 
            text-align: center; 
        }
        
        .slip-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 0.5mm; 
            margin-top: 0.5mm; 
            font-size: 10pt; 
            gap: 1mm; 
            overflow: hidden; 
        }
        
        .sec-id { 
            font-weight: bold; 
            font-size: 11pt; 
            white-space: nowrap; 
        }
        
        .voter-info { 
            flex: 1; 
            overflow: hidden; 
            min-height: 0; 
        }
        
        .info-row { 
            margin-bottom: 0.6mm; 
            font-size: 11pt; 
            display: flex; 
            line-height: 1.25; 
            overflow: hidden; 
        }
        
        .info-row.voter-name { 
            font-size: 13pt; 
            font-weight: bold; 
            margin-bottom: 1mm; 
        }
        
        .info-label { 
            font-weight: bold; 
            min-width: 18mm; 
            flex-shrink: 0; 
        }
        
        .info-value { 
            flex: 1; 
            word-break: break-word; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            min-width: 0; 
        }
        
        .polling-station-info { 
            font-size: 11pt; 
            border-top: 1px solid #000; 
            padding-top: 0.8mm; 
            margin-top: 0.5mm; 
            line-height: 1.3; 
            font-weight: 600; 
            word-wrap: break-word; 
            white-space: normal; 
            overflow-wrap: break-word; 
            min-height: 8mm; 
            display: flex; 
            align-items: center; 
        }
        
        @media print { 
            @page { size: A4; margin: 0; } 
        }
    </style>
</head>
<body>`;

    // Generate pages - 5 slips per page
    const htmlParts = [];
    for (let i = 0; i < voters.length; i += slipsPerPage) {
        htmlParts.push('<div class="page">');
        const pageVoters = voters.slice(i, Math.min(i + slipsPerPage, voters.length));
        
        pageVoters.forEach((voter, index) => {
            const serialNo = voter.serialNo || voter.sl_no || i + index + 1;
            const epicNumber = voter.epicNo || voter.id_card_no || voter.epic_no || 'N/A';
            
            // Extract gender and age from voter data
            const gender = voter.gender || '';
            const age = voter.age || '';
            const genderAge = (gender || age) ? ` (${gender}${gender && age ? '/' : ''}${age})` : '';
            
            // House name and number
            const houseName = voter.houseName || voter.house_name_eng || voter.house_name || '';
            const houseNumber = voter.houseNumber || voter.house_no || voter.house_no_v1 || '';
            
            // Relation/guardian name
            const relationName = voter.relativeName || voter.relation_name || voter.rln_name_eng || voter.rln_name || '';
            
            // Part number
            const partNumber = voter.partNumber || voter.part_no || '';
            
            htmlParts.push(`
            <div class="voter-slip">
                <div class="slip-left">
                    <div class="slip-left-content">
                        <div class="serial-label">ക്രമ നമ്പർ</div>
                        <div class="serial-value">${serialNo}</div>
                    </div>
                </div>
                <div class="slip-right">
                    <div class="ward-info">നിയോജക മണ്ഡലം: ${constituency}</div>
                    <div class="slip-header">
                        <div class="sec-id">കാർഡ് നമ്പർ: ${epicNumber}</div>
                    </div>
                    <div class="voter-info">
                        <div class="info-row voter-name">
                            <span class="info-label">പേര്:</span>
                            <span class="info-value">${voter.name || voter.name_eng || voter.name_mal || 'N/A'}${genderAge}</span>
                        </div>
                        ${houseName || houseNumber ? `
                        <div class="info-row">
                            <span class="info-label">വീട്ടുപേര്:</span>
                            <span class="info-value">${houseName} ${houseNumber ? `(${houseNumber})` : ''}</span>
                        </div>
                        ` : ''}
                        ${relationName ? `
                        <div class="info-row">
                            <span class="info-label">രക്ഷിതാവ്:</span>
                            <span class="info-value">${relationName}</span>
                        </div>
                        ` : ''}
                        ${partNumber ? `
                        <div class="info-row">
                            <span class="info-label">ഭാഗം നമ്പർ:</span>
                            <span class="info-value">${partNumber}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="polling-station-info">ജില്ല: ${district}</div>
                </div>
            </div>`);
        });
        
        htmlParts.push('</div>');
    }

    htmlParts.push(`
</body>
</html>`);

    return html + htmlParts.join('');
};

/**
 * Save voter slips HTML to file
 */
export const saveVoterSlipsToFile = (voters, metadata, outputDir = 'voter-slips') => {
    try {
        // Create output directory
        const slipsDir = path.join(process.cwd(), outputDir);
        if (!fs.existsSync(slipsDir)) {
            fs.mkdirSync(slipsDir, { recursive: true });
        }
        
        // Generate HTML
        const html = generateVoterSlips(voters, metadata);
        
        // Save to file
        const filename = `voter-slips-AC${metadata.constituency}-${Date.now()}.html`;
        const filepath = path.join(slipsDir, filename);
        
        fs.writeFileSync(filepath, html, 'utf8');
        
        logger.info(`✅ Voter slips saved to: ${filepath}`);
        
        return {
            success: true,
            filepath,
            filename,
            totalSlips: voters.length
        };
    } catch (error) {
        logger.error('Error saving voter slips:', error);
        throw error;
    }
};

export default {
    generateVoterSlips,
    saveVoterSlipsToFile
};
