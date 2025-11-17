// Activity Tracking Client-Side Library
// Automatically tracks user activities and sends them to the server

class ActivityTracker {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
        this.token = localStorage.getItem('token');
        this.apiUrl = window.location.origin;
        this.queue = [];
        this.isTracking = true;
        this.lastAction = null;
        this.actionStartTime = Date.now();
        
        this.init();
    }

    init() {
        // Send device and screen info on page load
        this.sendDeviceInfo();
        
        // Track page views
        this.trackPageView();
        
        // Setup activity listeners
        this.setupListeners();
        
        // Process queue periodically
        setInterval(() => this.processQueue(), 5000);
        
        // Update session on page unload
        window.addEventListener('beforeunload', () => this.endSession());
    }

    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('sessionId');
        if (!sessionId) {
            sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('sessionId', sessionId);
        }
        return sessionId;
    }

    sendDeviceInfo() {
        // Send screen dimensions and session info via custom headers
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        
        // Store in sessionStorage for subsequent requests
        sessionStorage.setItem('screenWidth', screenWidth);
        sessionStorage.setItem('screenHeight', screenHeight);
    }

    async track(action, details = {}) {
        if (!this.isTracking) return;

        const activity = {
            action,
            details: {
                ...details,
                duration: Date.now() - this.actionStartTime
            },
            sessionId: this.sessionId,
            page: {
                url: window.location.pathname,
                title: document.title,
                referrer: document.referrer
            },
            timestamp: new Date().toISOString()
        };

        this.queue.push(activity);
        this.lastAction = action;
        this.actionStartTime = Date.now();

        // Send immediately for critical actions
        const criticalActions = ['payment_initiated', 'payment_success', 'order_created', 'error_occurred'];
        if (criticalActions.includes(action)) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0 || !this.token) return;

        const activities = [...this.queue];
        this.queue = [];

        try {
            await fetch(`${this.apiUrl}/api/activity/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'x-session-id': this.sessionId,
                    'x-screen-width': sessionStorage.getItem('screenWidth') || '',
                    'x-screen-height': sessionStorage.getItem('screenHeight') || ''
                },
                body: JSON.stringify({ activities })
            });
        } catch (error) {
            console.error('Failed to track activities:', error);
            // Re-queue failed activities
            this.queue.unshift(...activities);
        }
    }

    trackPageView() {
        this.track('page_view', {
            pageTitle: document.title,
            url: window.location.href
        });
    }

    setupListeners() {
        // Track form submissions
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.id || form.name) {
                this.track('form_submitted', {
                    formId: form.id || form.name,
                    formAction: form.action
                });
            }
        });

        // Track button clicks
        document.addEventListener('click', (e) => {
            const button = e.target.closest('button, a[role="button"]');
            if (button) {
                this.track('button_clicked', {
                    buttonText: button.textContent?.trim().substring(0, 50),
                    buttonId: button.id,
                    buttonClass: button.className
                });
            }
        });

        // Track dropdown/select changes
        document.addEventListener('change', (e) => {
            const element = e.target;
            
            if (element.tagName === 'SELECT') {
                const selectId = element.id || element.name || 'unknown';
                const selectedOption = element.options[element.selectedIndex];
                
                // Determine action type based on select ID
                let action = 'dropdown_selected';
                if (selectId.includes('district')) {
                    action = 'district_selected';
                } else if (selectId.includes('localBody') || selectId.includes('local-body')) {
                    action = 'local_body_selected';
                } else if (selectId.includes('ward')) {
                    action = 'ward_selected';
                } else if (selectId.includes('polling') || selectId.includes('station')) {
                    action = 'polling_station_selected';
                }
                
                this.track(action, {
                    selectId: selectId,
                    selectedValue: element.value,
                    selectedText: selectedOption?.text || element.value,
                    selectName: element.name
                });
            }
            
            // Track radio button changes
            if (element.type === 'radio') {
                this.track('radio_selected', {
                    name: element.name,
                    value: element.value,
                    id: element.id
                });
            }
            
            // Track checkbox changes
            if (element.type === 'checkbox') {
                this.track('checkbox_toggled', {
                    name: element.name,
                    id: element.id,
                    checked: element.checked
                });
            }
        });

        // Track text input changes (debounced)
        let inputTimeout;
        document.addEventListener('input', (e) => {
            const element = e.target;
            
            if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'search')) {
                clearTimeout(inputTimeout);
                inputTimeout = setTimeout(() => {
                    this.track('input_changed', {
                        inputId: element.id || element.name || 'unknown',
                        inputName: element.name,
                        inputType: element.type,
                        hasValue: !!element.value
                    });
                }, 1000); // Track after 1 second of no typing
            }
        });

        // Track file uploads
        document.addEventListener('change', (e) => {
            if (e.target.type === 'file' && e.target.files.length > 0) {
                this.track('file_uploaded', {
                    fileName: e.target.files[0].name,
                    fileSize: e.target.files[0].size,
                    fileType: e.target.files[0].type,
                    inputId: e.target.id || e.target.name
                });
            }
        });

        // Track navigation
        let lastPath = window.location.pathname;
        setInterval(() => {
            if (window.location.pathname !== lastPath) {
                lastPath = window.location.pathname;
                this.trackPageView();
            }
        }, 1000);
    }

    endSession() {
        this.processQueue();
        navigator.sendBeacon(`${this.apiUrl}/api/activity/end-session`, JSON.stringify({
            sessionId: this.sessionId
        }));
    }

    // Public methods for manual tracking
    trackAction(action, details = {}) {
        this.track(action, details);
    }

    trackError(error, details = {}) {
        this.track('error_occurred', {
            error: error.message || error,
            stack: error.stack,
            ...details
        });
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }
}

// Initialize tracker if user is logged in
let activityTracker = null;

function initActivityTracker() {
    const token = localStorage.getItem('token');
    if (token && !activityTracker) {
        activityTracker = new ActivityTracker();
        window.activityTracker = activityTracker;
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initActivityTracker);
} else {
    initActivityTracker();
}

// Export for manual tracking
window.trackActivity = function(action, details) {
    if (activityTracker) {
        activityTracker.trackAction(action, details);
    }
};

window.trackError = function(error, details) {
    if (activityTracker) {
        activityTracker.trackError(error, details);
    }
};
