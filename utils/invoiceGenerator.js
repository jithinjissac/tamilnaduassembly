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
    // Only remove control characters, keep Malayalam and other Unicode
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters only
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

            // Try to register Anek Malayalam font for invoices
            const anekFontPath = path.join(process.cwd(), 'assets', 'fonts', 'AnekMalayalam-Regular.ttf');
            const anekBoldPath = path.join(process.cwd(), 'assets', 'fonts', 'AnekMalayalam-Bold.ttf');
            let hasMalayalamFont = false;
            try {
               if (fs.existsSync(anekFontPath)) {
                  doc.registerFont('AnekMalayalam', anekFontPath);
                  hasMalayalamFont = true;
                  console.log('✅ Anek Malayalam font registered successfully for invoice');
                  
                  // Try to register bold variant if available
                  if (fs.existsSync(anekBoldPath)) {
                      doc.registerFont('AnekMalayalam-Bold', anekBoldPath);
                      console.log('✅ Anek Malayalam Bold font registered');
                  }
               }
            } catch (e) {
               // fallback to Helvetica if anything goes wrong
               console.warn('⚠️ Malayalam font registration failed, using Helvetica:', e.message);
               hasMalayalamFont = false;
            }
            
            // Helper function to detect if text contains Malayalam characters
            const hasMalayalamChars = (text) => {
                if (!text) return false;
                return /[\u0D00-\u0D7F]/.test(text);
            };
            
            // Helper function to select appropriate font based on content
            const selectFont = (text, isBold = false) => {
                if (hasMalayalamFont && hasMalayalamChars(text)) {
                    // Use Anek Malayalam font (bold variant if available and requested)
                    return isBold && fs.existsSync(anekBoldPath) ? 'AnekMalayalam-Bold' : 'AnekMalayalam';
                }
                return isBold ? 'Helvetica-Bold' : 'Helvetica';
            };
            
            // Safe text rendering function with font fallback
            const safeText = (text, x, y, options = {}) => {
                if (!text) text = '';
                
                try {
                    const font = selectFont(text, options.bold);
                    doc.font(font);
                    doc.text(text, x, y, options);
                } catch (fontError) {
                    // Check if it's a fontkit anchor error
                    const isAnchorError = fontError.message && (
                        fontError.message.includes('xCoordinate') ||
                        fontError.message.includes('anchor') ||
                        fontError.message.includes('mark') ||
                        fontError.message.includes('Cannot read')
                    );
                    
                    if (isAnchorError && hasMalayalamFont && hasMalayalamChars(text)) {
                        // Malayalam font anchor error - use clean fallback without character rendering
                        console.warn('⚠️ Malayalam font anchor error for invoice, using Helvetica fallback');
                        try {
                            doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica');
                            // Extract only ASCII/Latin characters for safe rendering
                            const safeText = text.replace(/[\u0D00-\u0D7F]/g, ''); // Remove Malayalam chars
                            if (safeText.trim()) {
                                doc.text(safeText.trim(), x, y, options);
                            } else {
                                // If only Malayalam, show placeholder
                                doc.text('[Malayalam Text]', x, y, options);
                            }
                        } catch (retryError) {
                            console.error('⚠️ Helvetica fallback failed:', retryError.message);
                            // Skip this text completely
                        }
                    } else {
                        // Non-anchor error, use simple fallback
                        console.warn('⚠️ Font rendering error, falling back to Helvetica:', fontError.message);
                        try {
                            doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica');
                            doc.text(text, x, y, options);
                        } catch (fallbackError) {
                            console.error('⚠️ Even fallback rendering failed:', fallbackError.message);
                            // Last resort: just skip this text
                        }
                    }
                }
            };

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
            const userName = user.name || 'N/A';
            doc.fontSize(11);
            safeText(userName, 50, yPosition);
            
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
                safeText(`District: ${district}`, doc.page.width / 2, yPosition);
                  
                yPosition += 15;
                safeText(`Local Body: ${localBody}`, doc.page.width / 2, yPosition);
                
                yPosition += 15;
                safeText(`Ward: ${ward}`, doc.page.width / 2, yPosition);
            }            doc.font('Helvetica').text(`Payment Gateway: ${paymentGateway}`, doc.page.width / 2, yPosition + 30);

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
            // Use Malayalam symbol name with English fallback
            const symbolName = sanitizeTextForPDF(
                order.customization?.symbolNameMalayalam || 
                order.customization?.symbolName || 
                order.customization?.partyName
            );

            // Build comprehensive description with location details (sanitized)
            let description = 'Voter Slip Generation\n';
            const descParts = [];
            
            if (order.location) {
               const district = sanitizeTextForPDF(order.location.districtName || order.location.district);
               const localBody = sanitizeTextForPDF(order.location.localBodyName || order.location.localBody);
               const ward = sanitizeTextForPDF(order.location.wardName || order.location.ward);

               if (district && district !== 'N/A') descParts.push(`District: ${district}`);
               if (localBody && localBody !== 'N/A') descParts.push(`Local Body: ${localBody}`);
               if (ward && ward !== 'N/A') descParts.push(`Ward: ${ward}`);
            }
            descParts.push(`Symbol: ${symbolName}`);
            descParts.push(`Voters: ${order.totalVoters}`);
            
            description += descParts.join('\n');

            // Calculate description column width to prevent overflow - leave more space for numbers
            const descX = 50;
            const descWidth = qtyX - descX - 30; // increased padding to prevent overlap

            // Use appropriate font for description (detect Malayalam)
            const descStartY = yPosition;
            doc.fontSize(9); // slightly smaller font to prevent wrapping issues
            safeText(description, descX, yPosition, { 
                width: descWidth,
                lineBreak: true,
                align: 'left'
            });

            // Measure height used by description
            const descHeight = doc.heightOfString(description, { 
                width: descWidth,
                lineBreak: true 
            });

            // Draw numeric columns aligned to top of description with proper spacing
            doc.fontSize(10)
               .font('Helvetica')
               .text(order.totalVoters.toString(), qtyX, descStartY, { width: 60, align: 'left' })
               .text(`Rs. ${order.pricePerVoter.toFixed(2)}`, rateX, descStartY, { width: 70, align: 'left' })
               .text(`Rs. ${order.originalAmount.toFixed(2)}`, amountX, descStartY, { width: 80, align: 'right' });

            // Advance yPosition by description height (plus padding)
            yPosition = descStartY + Math.max(descHeight, 30) + 10; // increased min height and padding

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
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .text('PAYMENT INFORMATION:', 50, yPosition);
            
            yPosition += 25;
            doc.fontSize(10)
               .font('Helvetica')
               .text(`Payment Method: ${paymentGateway}`, 50, yPosition, { width: 500 })
               .text(`Transaction ID: ${paymentId}`, 50, yPosition + 20, { width: 500 })
               .text(`Payment Date: ${order.paidAt ? new Date(order.paidAt).toLocaleString('en-IN') : 'N/A'}`, 50, yPosition + 40, { width: 500 })
               .text(`Status: COMPLETED`, 50, yPosition + 60, { width: 500 });

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
