import nodemailer from 'nodemailer';
import { getEmailSettings } from './settingsHelper.js';

// Create reusable transporter (cached)
let transporter = null;
let lastConfigHash = null;

// Initialize or refresh transporter based on settings
async function getTransporter() {
    const settings = await getEmailSettings();
    
    // Check if SMTP is configured
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
        console.log('⚠️ SMTP not configured');
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
export async function sendEmail({ to, subject, html, text, skipSettingsCheck = false }) {
    try {
        const settings = await getEmailSettings();
        
        // Check if email is enabled (unless skipSettingsCheck is true for critical emails)
        if (!skipSettingsCheck && !settings.enableEmailNotifications) {
            console.log('📧 Email notifications disabled, skipping email');
            return { success: false, reason: 'disabled' };
        }
        
        // For critical emails (password reset), check if SMTP is configured
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
            console.log('⚠️ SMTP not configured');
            return { 
                success: false, 
                error: 'SMTP not configured. Please configure email settings in admin panel.' 
            };
        }
        
        const transport = await getTransporter();
        if (!transport) {
            console.log('⚠️ Email transporter not available');
            return { 
                success: false, 
                error: 'Email transporter not available. Please check SMTP settings.' 
            };
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
    
    // Get template settings with defaults
    const template = settings.orderConfirmation || {
        subject: 'Order Confirmed - {{wardName}} - {{orderId}}',
        heading: 'Order Confirmed Successfully!',
        message: 'Your order has been confirmed.'
    };
    
    // Replace placeholders
    const replacePlaceholders = (text) => {
        return text
            .replace(/\{\{orderId\}\}/g, order.orderId || '')
            .replace(/\{\{voterCount\}\}/g, order.totalVoters || order.voterCount || '')
            .replace(/\{\{amount\}\}/g, order.amount || order.totalAmount || '')
            .replace(/\{\{userName\}\}/g, user.name || '')
            .replace(/\{\{userEmail\}\}/g, user.email || '')
            .replace(/\{\{wardName\}\}/g, order.location?.wardName || order.location?.ward || '')
            .replace(/\{\{pollingStation\}\}/g, order.location?.pollingStationName || order.location?.pollingStation || '')
            .replace(/\{\{symbolName\}\}/g, order.customization?.symbolNameMalayalam || order.customization?.symbolName || '')
            .replace(/\{\{district\}\}/g, order.location?.districtName || order.location?.district || '')
            .replace(/\{\{localBody\}\}/g, order.location?.localBodyName || order.location?.localBody || '');
    };
    
    const subject = replacePlaceholders(template.subject);
    const heading = replacePlaceholders(template.heading);
    const message = replacePlaceholders(template.message).replace(/\n/g, '<br>');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Noto Sans Malayalam', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .kerala-border { height: 8px; background: linear-gradient(to right, #006D3B 0%, #006D3B 33.33%, #FFB81C 33.33%, #FFB81C 66.66%, #E03A3E 66.66%, #E03A3E 100%); }
                .header { background: #006D3B; color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0 0 10px 0; font-size: 28px; }
                .header h2 { margin: 0; font-size: 20px; font-weight: 600; }
                .content { padding: 40px 30px; background: white; }
                .message { margin: 20px 0; font-size: 15px; line-height: 1.8; }
                .button { display: inline-block; background: #006D3B; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #FFB81C; margin-top: 30px; }
                .footer { background: #FFF8DC; padding: 25px 20px; text-align: center; font-size: 13px; color: #555; }
                .footer p { margin: 8px 0; }
            </style>
        </head>
        <body>
            <div class="kerala-border"></div>
            <div class="header">
                <h1>EASYSLIP</h1>
                <h2>${heading}</h2>
            </div>
            <div class="content">
                <div class="message">${message}</div>
                <center>
                    <a href="https://easyslip.in/dashboard.html" class="button">View Dashboard</a>
                </center>
            </div>
            <div class="kerala-border" style="height: 4px;"></div>
            <div class="footer">
                <p style="font-weight: 600; color: #006D3B;">EASYSLIP - Kerala Voter Slip Service</p>
                <p>🌐 <a href="https://easyslip.in" style="color: #006D3B; text-decoration: none;">https://easyslip.in</a></p>
                <p style="color: #777;">&copy; 2025 EASYSLIP. All rights reserved.</p>
            </div>
            <div class="kerala-border"></div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject,
        html
    });
}

export async function sendPaymentSuccessEmail(user, order) {
    const settings = await getEmailSettings();
    
    if (!settings.emailTemplates?.paymentSuccess) {
        console.log('📧 Payment success email disabled');
        return;
    }
    
    // Get template settings with defaults
    const template = settings.paymentSuccess || {
        subject: 'Payment Successful - Invoice & PDF - {{wardName}} - {{orderId}}',
        heading: 'Payment Received Successfully!',
        message: 'Your payment has been received.'
    };
    
    // Replace placeholders
    const replacePlaceholders = (text) => {
        return text
            .replace(/\{\{orderId\}\}/g, order.orderId || '')
            .replace(/\{\{voterCount\}\}/g, order.totalVoters || order.voterCount || '')
            .replace(/\{\{amount\}\}/g, order.amount || order.totalAmount || '')
            .replace(/\{\{userName\}\}/g, user.name || '')
            .replace(/\{\{userEmail\}\}/g, user.email || '')
            .replace(/\{\{wardName\}\}/g, order.location?.wardName || order.location?.ward || '')
            .replace(/\{\{pollingStation\}\}/g, order.location?.pollingStationName || order.location?.pollingStation || '')
            .replace(/\{\{symbolName\}\}/g, order.customization?.symbolNameMalayalam || order.customization?.symbolName || '')
            .replace(/\{\{district\}\}/g, order.location?.districtName || order.location?.district || '')
            .replace(/\{\{localBody\}\}/g, order.location?.localBodyName || order.location?.localBody || '');
    };
    
    const subject = replacePlaceholders(template.subject);
    const heading = replacePlaceholders(template.heading);
    const message = replacePlaceholders(template.message).replace(/\n/g, '<br>');
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://easyslip.in';
    const invoiceUrl = `${frontendUrl}/order-success.html?orderId=${order.orderId}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Noto Sans Malayalam', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .kerala-border { height: 8px; background: linear-gradient(to right, #006D3B 0%, #006D3B 33.33%, #FFB81C 33.33%, #FFB81C 66.66%, #E03A3E 66.66%, #E03A3E 100%); }
                .header { background: #006D3B; color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0 0 10px 0; font-size: 28px; }
                .header h2 { margin: 0; font-size: 20px; font-weight: 600; }
                .content { padding: 40px 30px; background: white; }
                .message { margin: 20px 0; font-size: 15px; line-height: 1.8; }
                .button { display: inline-block; background: #006D3B; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #FFB81C; margin: 10px 5px; }
                .button.invoice { background: #10b981; border-color: #059669; }
                .footer { background: #FFF8DC; padding: 25px 20px; text-align: center; font-size: 13px; color: #555; }
                .footer p { margin: 8px 0; }
            </style>
        </head>
        <body>
            <div class="kerala-border"></div>
            <div class="header">
                <h1>EASYSLIP</h1>
                <h2>${heading}</h2>
            </div>
            <div class="content">
                <div class="message">${message}</div>
                <center>
                    <a href="${invoiceUrl}" class="button invoice">📄 Download Invoice</a>
                    <a href="https://easyslip.in/dashboard.html" class="button">View Dashboard</a>
                </center>
            </div>
            <div class="kerala-border" style="height: 4px;"></div>
            <div class="footer">
                <p style="font-weight: 600; color: #006D3B;">EASYSLIP - Kerala Voter Slip Service</p>
                <p>🌐 <a href="https://easyslip.in" style="color: #006D3B; text-decoration: none;">https://easyslip.in</a></p>
                <p style="color: #777;">&copy; 2025 EASYSLIP. All rights reserved.</p>
            </div>
            <div class="kerala-border"></div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject,
        html
    });
}

export async function sendPDFReadyEmail(user, order) {
    const settings = await getEmailSettings();
    
    if (!settings.emailTemplates?.pdfReady) {
        console.log('📧 PDF ready email disabled');
        return;
    }
    
    // Get template settings with defaults
    const template = settings.pdfReady || {
        subject: 'Your Voter Slips are Ready - {{wardName}} - {{orderId}}',
        heading: 'Your PDF is Ready for Download!',
        message: 'Your voter slips PDF is ready.'
    };
    
    // Replace placeholders
    const replacePlaceholders = (text) => {
        return text
            .replace(/\{\{orderId\}\}/g, order.orderId || '')
            .replace(/\{\{voterCount\}\}/g, order.totalVoters || order.voterCount || '')
            .replace(/\{\{amount\}\}/g, order.amount || order.totalAmount || '')
            .replace(/\{\{userName\}\}/g, user.name || '')
            .replace(/\{\{userEmail\}\}/g, user.email || '')
            .replace(/\{\{wardName\}\}/g, order.location?.wardName || order.location?.ward || '')
            .replace(/\{\{pollingStation\}\}/g, order.location?.pollingStationName || order.location?.pollingStation || '')
            .replace(/\{\{symbolName\}\}/g, order.customization?.symbolNameMalayalam || order.customization?.symbolName || '')
            .replace(/\{\{district\}\}/g, order.location?.districtName || order.location?.district || '')
            .replace(/\{\{localBody\}\}/g, order.location?.localBodyName || order.location?.localBody || '');
    };
    
    const subject = replacePlaceholders(template.subject);
    const heading = replacePlaceholders(template.heading);
    const message = replacePlaceholders(template.message).replace(/\n/g, '<br>');
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://easyslip.in';
    const pdfUrl = `${frontendUrl}/order-success.html?orderId=${order.orderId}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Noto Sans Malayalam', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .kerala-border { height: 8px; background: linear-gradient(to right, #006D3B 0%, #006D3B 33.33%, #FFB81C 33.33%, #FFB81C 66.66%, #E03A3E 66.66%, #E03A3E 100%); }
                .header { background: #006D3B; color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0 0 10px 0; font-size: 28px; }
                .header h2 { margin: 0; font-size: 20px; font-weight: 600; }
                .content { padding: 40px 30px; background: white; }
                .message { margin: 20px 0; font-size: 15px; line-height: 1.8; }
                .button { display: inline-block; background: #006D3B; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #FFB81C; margin: 10px 5px; }
                .footer { background: #FFF8DC; padding: 25px 20px; text-align: center; font-size: 13px; color: #555; }
                .footer p { margin: 8px 0; }
            </style>
        </head>
        <body>
            <div class="kerala-border"></div>
            <div class="header">
                <h1>EASYSLIP</h1>
                <h2>${heading}</h2>
            </div>
            <div class="content">
                <div class="message">${message}</div>
                <center>
                    <a href="${pdfUrl}" class="button">📄 Download PDF Now</a>
                    <a href="https://easyslip.in/dashboard.html" class="button">View Dashboard</a>
                </center>
            </div>
            <div class="kerala-border" style="height: 4px;"></div>
            <div class="footer">
                <p style="font-weight: 600; color: #006D3B;">EASYSLIP - Kerala Voter Slip Service</p>
                <p>🌐 <a href="https://easyslip.in" style="color: #006D3B; text-decoration: none;">https://easyslip.in</a></p>
                <p style="color: #777;">&copy; 2025 EASYSLIP. All rights reserved.</p>
            </div>
            <div class="kerala-border"></div>
        </body>
        </html>
    `;
    
    return await sendEmail({
        to: user.email,
        subject,
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
