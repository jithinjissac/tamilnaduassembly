// Detect Facebook/Instagram in-app browser and prompt user to open in default browser
(function() {
    'use strict';
    
    // Detect if running in Facebook or Instagram in-app browser
    function isInAppBrowser() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        
        // Debug: Log user agent
        console.log('User Agent:', ua);
        
        // Check for Facebook in-app browser (multiple patterns)
        const isFacebookBrowser = (ua.indexOf('FBAN') > -1) || 
                                  (ua.indexOf('FBAV') > -1) || 
                                  (ua.indexOf('FB_IAB') > -1) ||
                                  (ua.indexOf('FB4A') > -1) ||
                                  (ua.indexOf('FBIOS') > -1) ||
                                  (ua.indexOf('[FBAN') > -1);
        
        // Check for Instagram in-app browser
        const isInstagramBrowser = ua.indexOf('Instagram') > -1;
        
        // Check for Messenger in-app browser
        const isMessengerBrowser = (ua.indexOf('MessengerLite') > -1) || (ua.indexOf('Messenger') > -1);
        
        const detected = isFacebookBrowser || isInstagramBrowser || isMessengerBrowser;
        console.log('In-app browser detected:', detected);
        
        return detected;
    }
    
    // Get browser name for display
    function getInAppBrowserName() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        if ((ua.indexOf('FBAN') > -1) || (ua.indexOf('FBAV') > -1) || (ua.indexOf('FB_IAB') > -1) || (ua.indexOf('FB4A') > -1) || (ua.indexOf('FBIOS') > -1)) {
            return 'Facebook';
        }
        if (ua.indexOf('Instagram') > -1) {
            return 'Instagram';
        }
        if ((ua.indexOf('MessengerLite') > -1) || (ua.indexOf('Messenger') > -1)) {
            return 'Messenger';
        }
        return 'in-app';
    }
    
    // Try to open in default browser automatically
    function tryOpenInDefaultBrowser() {
        const currentUrl = window.location.href;
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if (isAndroid) {
            // Try Android intent to open in Chrome/default browser
            // This creates a chooser that lets user pick their default browser
            const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
            window.location.href = intentUrl;
            
            // Also try the googlechrome:// scheme as fallback
            setTimeout(() => {
                window.location.href = `googlechrome://navigate?url=${encodeURIComponent(currentUrl)}`;
            }, 500);
            
            return true;
        } else if (isIOS) {
            // iOS doesn't allow direct opening in Safari from in-app browsers
            // User must use the share menu
            return false;
        }
        
        return false;
    }
    
    // Show modal to open in default browser
    function showOpenInBrowserModal() {
        const browserName = getInAppBrowserName();
        const currentUrl = window.location.href;
        
        // Try to open automatically first (Android only)
        const attemptedAutoOpen = tryOpenInDefaultBrowser();
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'inAppBrowserOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 30px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        `;
        
        // Detect device type
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        // Create instructions based on device
        let instructions = '';
        let autoOpenMessage = '';
        
        if (isAndroid) {
            autoOpenMessage = attemptedAutoOpen ? `
                <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 15px 0;">
                    <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                        <strong>🚀 Attempting to open in Chrome...</strong><br>
                        If the browser doesn't open automatically, follow the steps below.
                    </p>
                </div>
            ` : '';
            
            instructions = `
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                    <strong>To manually open in Chrome/Browser:</strong><br>
                    1. Tap the <strong>three dots (⋮)</strong> menu at the top-right<br>
                    2. Select <strong>"Open in Chrome"</strong> or <strong>"Open in browser"</strong>
                </p>
            `;
        } else if (isIOS) {
            instructions = `
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                    <strong>To open in Safari:</strong><br>
                    1. Tap the <strong>three dots (⋯)</strong> at the bottom/top-right<br>
                    2. Select <strong>"Open in Safari"</strong> or <strong>"Open in Browser"</strong>
                </p>
            `;
        } else {
            instructions = `
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                    Please open this link in your default browser for the best experience.
                </p>
            `;
        }
        
        modal.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <h2 style="color: #333; margin: 0 0 10px 0; font-size: 22px;">
                ${browserName} Browser Detected
            </h2>
            <p style="color: #666; font-size: 15px; margin: 0 0 20px 0;">
                For the best experience and full functionality, please open this page in your phone's default browser.
            </p>
            ${autoOpenMessage}
            ${instructions}
            <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 12px;">
                ${isAndroid ? `
                <button id="openBrowserBtn" style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    padding: 14px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">
                    🌐 Open in Chrome
                </button>
                ` : ''}
                <button id="copyUrlBtn" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 14px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">
                    📋 Copy Link
                </button>
                <button id="continueAnywayBtn" style="
                    background: transparent;
                    color: #666;
                    border: 2px solid #ddd;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    Continue Anyway
                </button>
            </div>
            <p style="color: #999; font-size: 12px; margin: 15px 0 0 0;">
                Some features may not work correctly in the ${browserName} browser.
            </p>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Open in browser button handler (Android only)
        const openBrowserBtn = document.getElementById('openBrowserBtn');
        if (openBrowserBtn) {
            openBrowserBtn.addEventListener('click', function() {
                tryOpenInDefaultBrowser();
                this.innerHTML = '✅ Opening...';
                this.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
            });
        }
        
        // Copy URL button handler
        document.getElementById('copyUrlBtn').addEventListener('click', function() {
            // Try to copy to clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(currentUrl).then(function() {
                    this.innerHTML = '✅ Link Copied!';
                    this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    setTimeout(() => {
                        this.innerHTML = '📋 Copy Link';
                        this.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 2000);
                }.bind(this)).catch(function() {
                    // Fallback: show URL in alert
                    alert('Copy this link:\n\n' + currentUrl);
                });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = currentUrl;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    this.innerHTML = '✅ Link Copied!';
                    this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    setTimeout(() => {
                        this.innerHTML = '📋 Copy Link';
                        this.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 2000);
                } catch (err) {
                    alert('Copy this link:\n\n' + currentUrl);
                }
                document.body.removeChild(textArea);
            }
        });
        
        // Continue anyway button handler
        document.getElementById('continueAnywayBtn').addEventListener('click', function() {
            overlay.remove();
            // Store that user chose to continue
            sessionStorage.setItem('inAppBrowserDismissed', 'true');
        });
        
        // Add hover effects
        const buttons = modal.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
            });
        });
    }
    
    // Check if running in in-app browser and show modal
    function checkAndShowModal() {
        // Don't show if already dismissed in this session
        if (sessionStorage.getItem('inAppBrowserDismissed') === 'true') {
            return;
        }
        
        if (isInAppBrowser()) {
            console.log('⚠️ In-app browser detected:', getInAppBrowserName());
            // Show modal immediately for better user experience
            setTimeout(showOpenInBrowserModal, 100);
        }
    }
    
    // Run check when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowModal);
    } else {
        checkAndShowModal();
    }
})();
