import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Sanitize text for PDF to avoid fontkit errors with special characters
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeTextForPDF(text) {
    if (!text) return '';
    // Remove or replace characters that might cause fontkit errors
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/[^\x00-\x7F]/g, (char) => {
            // Keep common printable characters, replace others with '?'
            const code = char.charCodeAt(0);
            if (code >= 0x0600 && code <= 0x06FF) return char; // Arabic
            if (code >= 0x0D00 && code <= 0x0D7F) return char; // Malayalam
            if (code >= 0x0900 && code <= 0x097F) return char; // Devanagari
            return '?';
        })
        .trim();
}

/**
 * Generate invoice PDF for a paid order
 * @param {Object} order - Order document from MongoDB
 * @param {Object} user - User document from MongoDB
 * @returns {Buffer} - PDF buffer
 */
export async function generateInvoice(order, user) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                size: 'A4',
                margin: 50
            });

            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Get payment gateway used
            const paymentGateway = order.razorpayPaymentId ? 'Razorpay' : 
                                 order.cashfreePaymentId ? 'Cashfree' : 'N/A';
            const paymentId = order.razorpayPaymentId || order.cashfreePaymentId || 'N/A';

            // Try to register Noto Sans Malayalam if available in assets/fonts
            const notoFontPath = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansMalayalam-Regular.ttf');
            let contentFont = 'Helvetica';
            try {
               if (fs.existsSync(notoFontPath)) {
                  doc.registerFont('NotoSansMalayalam', notoFontPath);
                  contentFont = 'NotoSansMalayalam';
               }
            } catch (e) {
               // fallback to Helvetica if anything goes wrong
               contentFont = 'Helvetica';
            }

            // Header with Kerala theme colors
            doc.rect(0, 0, doc.page.width, 150).fill('#667eea');
            
            doc.fillColor('#ffffff')
               .fontSize(28)
               .font('Helvetica-Bold')
               .text('INVOICE', 50, 50);
            
            doc.fontSize(12)
               .font('Helvetica')
               .text('Kerala Local Body Election Voter Slip Generator', 50, 85)
               .text('EasySlip.in', 50, 100)
               .text('support@easyslip.in', 50, 115);

            // Invoice details box (right side)
            doc.fillColor('#ffffff')
               .fontSize(10)
               .text(`Invoice #: ${order.orderId}`, doc.page.width - 250, 50)
               .text(`Date: ${order.paidAt ? new Date(order.paidAt).toLocaleDateString('en-IN') : new Date(order.createdAt).toLocaleDateString('en-IN')}`, doc.page.width - 250, 65)
               .text(`Payment Status: PAID`, doc.page.width - 250, 80)
               .text(`Payment ID: ${paymentId}`, doc.page.width - 250, 95);

            // Reset to black for content
            doc.fillColor('#000000');

            // Bill To section
            let yPosition = 180;
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('BILL TO:', 50, yPosition);
            
            yPosition += 20;
            doc.fontSize(11)
               .font(contentFont) // Use contentFont for user name (may contain Malayalam)
               .text(user.name || 'N/A', 50, yPosition);
            
            doc.font('Helvetica') // Switch back to Helvetica for email/phone
               .text(user.email || 'N/A', 50, yPosition + 15)
               .text(user.phone || 'N/A', 50, yPosition + 30);

            // Order Details section
            yPosition = 180;
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('ORDER DETAILS:', doc.page.width / 2, yPosition);
            
            yPosition += 20;
            doc.fontSize(11)
               .font('Helvetica')
               .text(`Order ID: ${order.orderId}`, doc.page.width / 2, yPosition)
               .text(`Total Voters: ${order.totalVoters}`, doc.page.width / 2, yPosition + 15);
            
            // Add location details (sanitized to avoid fontkit errors)
            if (order.location) {
                const district = sanitizeTextForPDF(order.location.districtName || order.location.district);
                const localBody = sanitizeTextForPDF(order.location.localBodyName || order.location.localBody);
                const ward = sanitizeTextForPDF(order.location.wardName || order.location.ward);
                
                yPosition += 30;
                doc.font('Helvetica').text(`District: ${district}`, doc.page.width / 2, yPosition);
                
                yPosition += 15;
                doc.font('Helvetica').text(`Local Body: ${localBody}`, doc.page.width / 2, yPosition);
                
                yPosition += 15;
                doc.font('Helvetica').text(`Ward: ${ward}`, doc.page.width / 2, yPosition);
            }
            
            doc.font('Helvetica').text(`Payment Gateway: ${paymentGateway}`, doc.page.width / 2, yPosition + 30);

            // Line separator
            yPosition = 330; // Adjusted for location details
            doc.moveTo(50, yPosition)
               .lineTo(doc.page.width - 50, yPosition)
               .stroke('#667eea');

            // Items table header
            yPosition += 30;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .text('DESCRIPTION', 50, yPosition);

            // Column X positions (better spacing for Malayalam text)
            const qtyX = 330;
            const rateX = 400;
            const amountX = 490;

            doc.text('QTY', qtyX, yPosition)
               .text('RATE', rateX, yPosition)
               .text('AMOUNT', amountX, yPosition);

            // Table header line
            yPosition += 20;
            doc.moveTo(50, yPosition)
               .lineTo(doc.page.width - 50, yPosition)
               .stroke('#cccccc');

            // Item row
            yPosition += 20;
            const symbolName = sanitizeTextForPDF(order.customization?.symbolName || order.customization?.partyName);

            // Build comprehensive description with location details (sanitized)
            let description = 'Voter Slip Generation\n';
            if (order.location) {
               const district = sanitizeTextForPDF(order.location.districtName || order.location.district);
               const localBody = sanitizeTextForPDF(order.location.localBodyName || order.location.localBody);
               const ward = sanitizeTextForPDF(order.location.wardName || order.location.ward);

               if (district && district !== 'N/A') description += `District: ${district}\n`;
               if (localBody && localBody !== 'N/A') description += `Local Body: ${localBody}\n`;
               if (ward && ward !== 'N/A') description += `Ward: ${ward}\n`;
            }
            description += `Symbol: ${symbolName}\n`;
            description += `Voters: ${order.totalVoters}`;

            // Calculate description column width to prevent overflow
            const descX = 50;
            const descWidth = qtyX - descX - 20; // more padding for Malayalam text

            // Use Helvetica for all text (sanitized)
            const descStartY = yPosition;
            doc.font('Helvetica').fontSize(10);
            doc.text(description, descX, yPosition, { 
                width: descWidth,
                lineBreak: true,
                align: 'left'
            });

            // Measure height used by description
            const descHeight = doc.heightOfString(description, { 
                width: descWidth,
                lineBreak: true 
            });

            // Draw numeric columns aligned to top of description
            doc.font('Helvetica')
               .text(order.totalVoters.toString(), qtyX, descStartY)
               .text(`Rs. ${order.pricePerVoter.toFixed(2)}`, rateX, descStartY)
               .text(`Rs. ${order.originalAmount.toFixed(2)}`, amountX, descStartY);

            // Advance yPosition by description height (plus padding)
            yPosition = descStartY + Math.max(descHeight, 20) + 5;

            // Discount row (if applicable)
            if (order.originalAmount !== order.amount) {
                yPosition += 10;
                const discount = order.originalAmount - order.amount;
                doc.fillColor('#16a34a')
                   .font('Helvetica')
                   .text('Discount Applied', 50, yPosition)
                   .fillColor('#000000')
                   .text(`-Rs. ${discount.toFixed(2)}`, amountX, yPosition);
            }

            // Bottom line
            // ensure some spacing after items
            yPosition += 10;
            doc.moveTo(50, yPosition)
               .lineTo(doc.page.width - 50, yPosition)
               .stroke('#cccccc');

            // Subtotal
            yPosition += 20;
            const labelX = rateX - 50;
            doc.fontSize(11)
               .font('Helvetica')
               .text('Subtotal:', labelX, yPosition)
               .text(`Rs. ${order.originalAmount.toFixed(2)}`, amountX, yPosition);

            // Discount line (if applicable)
            if (order.originalAmount !== order.amount) {
                yPosition += 20;
                const discount = order.originalAmount - order.amount;
                doc.fillColor('#16a34a')
                   .text('Discount:', labelX, yPosition)
                   .text(`-Rs. ${discount.toFixed(2)}`, amountX, yPosition);
                doc.fillColor('#000000');
            }

            // Total (bold and highlighted)
            yPosition += 20;
            doc.rect(50, yPosition - 5, doc.page.width - 100, 30).fill('#f3f4f6');
            doc.fillColor('#000000')
               .fontSize(14)
               .font('Helvetica-Bold')
               .text('TOTAL PAID:', labelX, yPosition)
               .text(`Rs. ${order.amount.toFixed(2)}`, amountX, yPosition);

            // Payment information
            yPosition += 60;
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .text('PAYMENT INFORMATION:', 50, yPosition);
            
            yPosition += 20;
            doc.font('Helvetica')
               .text(`Payment Method: ${paymentGateway}`, 50, yPosition)
               .text(`Transaction ID: ${paymentId}`, 50, yPosition + 15)
               .text(`Payment Date: ${order.paidAt ? new Date(order.paidAt).toLocaleString('en-IN') : 'N/A'}`, 50, yPosition + 30)
               .text(`Status: COMPLETED`, 50, yPosition + 45);

            // Footer section
            const footerY = doc.page.height - 100;
            doc.fontSize(9)
               .fillColor('#666666')
               .text('Thank you for using Kerala Local Body Election Voter Slip Generator!', 50, footerY, { align: 'center' })
               .text('This is a computer-generated invoice and does not require a signature.', 50, footerY + 15, { align: 'center' })
               .text('For support, contact: support@easyslip.in', 50, footerY + 30, { align: 'center' });

            // Add watermark if payment is pending (shouldn't happen, but safety check)
            if (order.paymentStatus !== 'completed') {
                doc.fontSize(60)
                   .fillColor('#ff0000', 0.1)
                   .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
                   .text('UNPAID', doc.page.width / 2 - 100, doc.page.height / 2, { align: 'center' })
                   .rotate(45, { origin: [doc.page.width / 2, doc.page.height / 2] });
            }

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get invoice filename for an order
 * @param {String} orderId - Order ID
 * @returns {String} - Invoice filename
 */
export function getInvoiceFilename(orderId) {
    return `invoice-${orderId}.pdf`;
}
