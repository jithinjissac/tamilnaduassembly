// Email template preview controller
export const previewEmailTemplate = async (req, res) => {
    try {
        const { templateType } = req.params;
        
        // Sample data for preview
        const sampleUser = {
            name: 'John Doe',
            email: 'john.doe@example.com'
        };
        
        const sampleOrder = {
            orderId: 'ORD-20251110-SAMPLE',
            voterCount: 1421,
            totalAmount: 710.50,
            location: {
                district: 'Kozhikode',
                districtName: 'Kozhikode / കോഴിക്കോട്',
                localBody: 'Velom',
                localBodyName: 'G11013-വേളം',
                ward: '010 - പെരുവയൽ',
                pollingStation: '2 Polling Stations'
            },
            paymentId: 'pay_SamplePaymentId123',
            paidAt: new Date()
        };
        
        let html = '';
        
        if (templateType === 'orderConfirmation') {
            html = generateOrderConfirmationHTML(sampleUser, sampleOrder);
        } else if (templateType === 'paymentSuccess') {
            html = generatePaymentSuccessHTML(sampleUser, sampleOrder);
        } else if (templateType === 'pdfReady') {
            html = generatePDFReadyHTML(sampleUser, sampleOrder);
        } else {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid template type'
            });
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (error) {
        console.error('❌ Error previewing template:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to preview template',
            error: error.message
        });
    }
};

// Template HTML generators
function generateOrderConfirmationHTML(user, order) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
                .order-details { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
                .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                .detail-row:last-child { border-bottom: none; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">🎉 Order Confirmed!</h1>
                </div>
                <div class="content">
                    <p>Hi <strong>${user.name}</strong>,</p>
                    <p>Thank you for your order! We've received your request and it's being processed.</p>
                    
                    <div class="order-details">
                        <h3 style="margin-top: 0;">Order Details</h3>
                        <div class="detail-row">
                            <strong>Order ID:</strong>
                            <span>${order.orderId}</span>
                        </div>
                        <div class="detail-row">
                            <strong>Voter Count:</strong>
                            <span>${order.voterCount} voters</span>
                        </div>
                        <div class="detail-row">
                            <strong>Total Amount:</strong>
                            <span>₹${order.totalAmount.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <strong>District:</strong>
                            <span>${order.location.districtName || order.location.district}</span>
                        </div>
                        <div class="detail-row">
                            <strong>Local Body:</strong>
                            <span>${order.location.localBodyName || order.location.localBody}</span>
                        </div>
                    </div>
                    
                    <p>Please complete your payment to generate the voter slip PDF.</p>
                    
                    <center>
                        <a href="#" class="button">
                            View Order & Pay
                        </a>
                    </center>
                    
                    <div class="footer">
                        <p><strong>Kerala Local Body Election Voter Slip Generator</strong></p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

function generatePaymentSuccessHTML(user, order) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
                .success-icon { font-size: 64px; margin-bottom: 10px; }
                .order-details { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0; }
                .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                .detail-row:last-child { border-bottom: none; }
                .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✅</div>
                    <h1 style="margin: 0;">Payment Successful!</h1>
                </div>
                <div class="content">
                    <p>Hi <strong>${user.name}</strong>,</p>
                    <p>Your payment has been received successfully! Your voter slip PDF is being generated.</p>
                    
                    <div class="order-details">
                        <h3 style="margin-top: 0;">Payment Details</h3>
                        <div class="detail-row">
                            <strong>Order ID:</strong>
                            <span>${order.orderId}</span>
                        </div>
                        <div class="detail-row">
                            <strong>Payment ID:</strong>
                            <span>${order.paymentId || 'Processing...'}</span>
                        </div>
                        <div class="detail-row">
                            <strong>Amount Paid:</strong>
                            <span>₹${order.totalAmount.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <strong>Voter Count:</strong>
                            <span>${order.voterCount} voters</span>
                        </div>
                    </div>
                    
                    <p>Your PDF will be ready for download shortly. You'll receive another email once it's ready.</p>
                    
                    <center>
                        <a href="#" class="button">
                            Download PDF
                        </a>
                    </center>
                    
                    <div class="footer">
                        <p><strong>Kerala Local Body Election Voter Slip Generator</strong></p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

function generatePDFReadyHTML(user, order) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
                .pdf-icon { font-size: 64px; margin-bottom: 10px; }
                .info-box { background: #f0f7ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #3b82f6; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="pdf-icon">📄</div>
                    <h1 style="margin: 0;">Your PDF is Ready!</h1>
                </div>
                <div class="content">
                    <p>Hi <strong>${user.name}</strong>,</p>
                    <p>Great news! Your voter slip PDF has been generated and is ready for download.</p>
                    
                    <div class="info-box">
                        <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order.orderId}</p>
                        <p style="margin: 5px 0;"><strong>Voter Count:</strong> ${order.voterCount} voters</p>
                    </div>
                    
                    <center>
                        <a href="#" class="button">
                            Download PDF Now
                        </a>
                    </center>
                    
                    <p style="color: #888; font-size: 14px; margin-top: 30px;">
                        <strong>Note:</strong> Your PDF will be available for download from your dashboard.
                    </p>
                    
                    <div class="footer">
                        <p><strong>Kerala Local Body Election Voter Slip Generator</strong></p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}
