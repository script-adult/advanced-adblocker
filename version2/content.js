// content.js

// Run the injectStyles function from your adblocker
if (typeof advancedAdBlockerV2 !== 'undefined' && advancedAdBlockerV2.injectStyles) {
    advancedAdBlockerV2.injectStyles();
}

// Function to attempt clearing local and session storage
function clearStorage() {
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (e) {
        console.warn('Could not clear storage from content script:', e);
    }
}

// Listen for messages from the background script to perform actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'clearStorage') {
        clearStorage();
    }
});

// Potentially send DOM information to the background script for AI analysis
// Example:
// const adElements = document.querySelectorAll('div[id*="ad"], div[class*="ad"]');
// chrome.runtime.sendMessage({ action: 'analyzeDOM', adCount: adElements.length });
