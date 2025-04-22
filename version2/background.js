// background.js

// Import your advancedAdBlockerV2 module (adjust path as needed)
import advancedAdBlockerV2 from './advanced_adblocker_v2.js';

// Instantiate the adblocker
const adblocker = advancedAdBlockerV2;

// Load settings from storage on startup
chrome.storage.sync.get(null, (settings) => {
    if (settings.blockThirdPartyCookies !== undefined) adblocker.setBlockThirdPartyCookies(settings.blockThirdPartyCookies);
    if (settings.clearCookiesOnNavigation !== undefined) adblocker.setClearCookiesOnNavigation(settings.clearCookiesOnNavigation);
    if (settings.blockLocalStorage !== undefined) adblocker.setBlockLocalStorage(settings.blockLocalStorage);
    if (settings.blockSessionStorage !== undefined) adblocker.setBlockSessionStorage(settings.blockSessionStorage);
    if (settings.userWhitelist !== undefined) settings.userWhitelist.forEach(domain => adblocker.addWhitelistDomain(domain));
    if (settings.customBlockedDomains !== undefined) settings.customBlockedDomains.forEach(rule => adblocker.addCustomBlockRule(rule));
    if (settings.customCSSRules !== undefined) settings.customCSSRules.forEach(rule => adblocker.addCustomCSSRule(rule));
    if (settings.spoofUserAgent !== undefined) adblocker.setSpoofUserAgent(settings.spoofUserAgent);
    if (settings.spoofCanvas !== undefined) adblocker.setSpoofCanvas(settings.spoofCanvas);
    if (settings.spoofWebRTC !== undefined) adblocker.setSpoofWebRTC(settings.spoofWebRTC);
    if (settings.blockFonts !== undefined) adblocker.setBlockFonts(settings.blockFonts);
    if (settings.blockImages !== undefined) adblocker.setBlockImages(settings.blockImages);
    if (settings.blockedResourceTypes !== undefined) settings.blockedResourceTypes.forEach(type => adblocker.addBlockedResourceType(type));

    // Initialize the adblocker after loading settings
    adblocker.init();
});

// Web request listener for blocking
chrome.webRequest.onBeforeRequest.addListener(
    details => ({ cancel: adblocker.shouldBlockRequest(details.url, details.type) }),
    { urls: ['<all_urls>'] },
    ['blocking']
);

// Cookie listener (example - you'll need more detailed logic)
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (adblocker.blockThirdPartyCookies) {
        // Implement logic to check if the cookie is third-party
        // and remove it if necessary, potentially comparing against cookieWhitelist.
        // You might need to query existing cookies on tab updates as well.
    }
    if (adblocker.clearCookiesOnNavigation && changeInfo.removed) {
        // This event fires when a cookie is removed. The clearing logic
        // might be better triggered on tab navigation events.
    }
});

// Listen for tab updates to handle cookie clearing on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && adblocker.clearCookiesOnNavigation) {
        chrome.cookies.getAll({ url: tab.url }, (cookies) => {
            cookies.forEach(cookie => {
                chrome.cookies.remove({ url: tab.url, name: cookie.name });
            });
        });
        // Attempt to clear local and session storage (content script needed)
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js'] // See content.js example below
        });
    }
});

// Message listener for communication from popup/settings page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setBlockThirdPartyCookies') {
        adblocker.setBlockThirdPartyCookies(request.value);
        chrome.storage.sync.set({ blockThirdPartyCookies: request.value });
    } else if (request.action === 'setClearCookiesOnNavigation') {
        adblocker.setClearCookiesOnNavigation(request.value);
        chrome.storage.sync.set({ clearCookiesOnNavigation: request.value });
    } else if (request.action === 'addWhitelistDomain') {
        adblocker.addWhitelistDomain(request.domain);
        chrome.storage.sync.get({ userWhitelist: [] }, (data) => {
            const newList = [...data.userWhitelist, request.domain];
            chrome.storage.sync.set({ userWhitelist: newList });
        });
    }
    // ... (handle other settings updates from the GUI)
});

// On install, inject the content script for cosmetic filtering
chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        });
    });
});

// On tab update (for existing tabs), also inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
    }
});
