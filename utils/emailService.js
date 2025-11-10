import nodemailer from 'nodemailer';
import { getEmailSettings } from './settingsHelper.js';

// Create reusable transporter (cached)
let transporter = null;
let lastConfigHash = null;

// Initialize or refresh transporter based on settings
async function getTransporter() {
    const settings = await getEmailSettings();
    
    // Check if email is enabled
    if (!settings.enableEmailNotifications) {
        return null;
    }
    
    // Create config hash to detect changes
    const configHash = JSON.stringify({
        host: settings.smtpHost,
        port: settings.smtpPort,
        user: settings.smtpUser,
        secure: settings.smtpSecure
    });
    
    // Create new transporter if config changed or doesn't exist
    if (!transporter || configHash !== lastConfigHash) {
        console.log('📧 Creating email transporter...');
        
        transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpSecure, // true for 465, false for other ports
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword
            }
        });
        
        lastConfigHash = configHash;
        console.log('✅ Email transporter created');
    }
    
    return transporter;
}

// Send email wrapper
export async function sendEmail({ to, subject, html, text }) {
    try {
        const settings = await getEmailSettings();
        
        // Check if email is enabled
        if (!settings.enableEmailNotifications) {
            console.log('📧 Email notifications disabled, skipping email');
            return { success: false, reason: 'disabled' };
        }
        
        const transport = await getTransporter();
        if (!transport) {
            console.log('⚠️ Email transporter not available');
            return { success: false, reason: 'no_transporter' };
        }
        
        const mailOptions = {
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to,
            subject,
            text: text || '',
            html: html || text
        };
        
        console.log('📧 Sending email to:', to);
        const info = await transport.sendMail(mailOptions);
        console.log('✅ Email sent:', info.messageId);
        
        return { success: true, messageId: info.messageId };
        
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        return { success: false, error: error.message };
    }
}

// Email Templates
export async function sendOrderConfirmationEmail(user, order) {
    const settings = await getEmailSettings();
    
    if (!settings.emailTemplates?.orderConfirmation) {
        console.log('📧 Order confirmation email disabled');
        return;
    }
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Order Confirmed!</h1>
                </div>
                <div class="content">
                    <p>Hi ${user.name},</p>
                    <p>Thank you for your order! We've received your request and it's being processed.</p>
                    
                    <div class="order-details">
                        <h3>Order Details</h3>
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
                        <a href="http://localhost:3000/order-success.html?orderId=${order.orderId}" class="button">
                            View Order & Pay
                        </a>
                    </center>
                    
                    <div class="footer">
                        <p>Kerala Voter Slip Generator</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject: `Order Confirmation - ${order.orderId}`,
        html
    });
}

export async function sendPaymentSuccessEmail(user, order) {
    const settings = await getEmailSettings();
    
    if (!settings.emailTemplates?.paymentSuccess) {
        console.log('📧 Payment success email disabled');
        return;
    }
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .success-icon { font-size: 64px; margin-bottom: 10px; }
                .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✅</div>
                    <h1>Payment Successful!</h1>
                </div>
                <div class="content">
                    <p>Hi ${user.name},</p>
                    <p>Your payment has been received successfully! Your voter slip PDF is being generated.</p>
                    
                    <div class="order-details">
                        <h3>Payment Details</h3>
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
                        <a href="http://localhost:3000/order-success.html?orderId=${order.orderId}" class="button">
                            Download PDF
                        </a>
                    </center>
                    
                    <div class="footer">
                        <p>Kerala Voter Slip Generator</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject: `Payment Successful - ${order.orderId}`,
        html
    });
}

export async function sendPDFReadyEmail(user, order) {
    const settings = await getEmailSettings();
    
    if (!settings.emailTemplates?.pdfReady) {
        console.log('📧 PDF ready email disabled');
        return;
    }
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .pdf-icon { font-size: 64px; margin-bottom: 10px; }
                .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="pdf-icon">📄</div>
                    <h1>Your PDF is Ready!</h1>
                </div>
                <div class="content">
                    <p>Hi ${user.name},</p>
                    <p>Great news! Your voter slip PDF has been generated and is ready for download.</p>
                    
                    <p><strong>Order ID:</strong> ${order.orderId}</p>
                    <p><strong>Voter Count:</strong> ${order.voterCount} voters</p>
                    
                    <center>
                        <a href="http://localhost:3000/order-success.html?orderId=${order.orderId}" class="button">
                            Download PDF Now
                        </a>
                    </center>
                    
                    <p style="color: #888; font-size: 14px; margin-top: 30px;">
                        Note: Your PDF will be available for download from your dashboard.
                    </p>
                    
                    <div class="footer">
                        <p>Kerala Voter Slip Generator</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject: `Your Voter Slip PDF is Ready - ${order.orderId}`,
        html
    });
}

// Test email connection
export async function testEmailConnection() {
    try {
        const transport = await getTransporter();
        if (!transport) {
            return { success: false, message: 'Email notifications disabled' };
        }
        
        await transport.verify();
        return { success: true, message: 'Email connection successful' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
