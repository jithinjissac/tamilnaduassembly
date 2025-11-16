// Console Logging Control (Global)
(function() {
    let enabled = localStorage.getItem('consoleLoggingEnabled');
    if (enabled === null) enabled = 'true';
    enabled = enabled !== 'false';

    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };

    function updateConsoleState() {
        if (enabled) {
            console.log = originalConsole.log;
            console.error = originalConsole.error;
            console.warn = originalConsole.warn;
            console.info = originalConsole.info;
        } else {
            console.log = function(){};
            console.warn = function(){};
            console.info = function(){};
            console.error = originalConsole.error;
        }
    }

    window.toggleGlobalConsoleLogs = function(on) {
        enabled = !!on;
        localStorage.setItem('consoleLoggingEnabled', enabled);
        updateConsoleState();
    };

    updateConsoleState();

    // Listen for changes from other tabs/windows
    window.addEventListener('storage', function(e) {
        if (e.key === 'consoleLoggingEnabled') {
            enabled = e.newValue !== 'false';
            updateConsoleState();
        }
    });
})();
