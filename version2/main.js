import advancedAdBlockerV2 from './advanced_adblocker_v2.js';

// Instantiate the adblocker
const adblocker = advancedAdBlockerV2;

// Generate a random 256-bit key for AES-GCM encryption
async function generateEncryptionKey() {
    return crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true, // whether the key is extractable (i.e. can be used outside the crypto API)
        ["encrypt", "decrypt"]
    );
}

// Encrypt data (using AES-GCM)
async function encryptData(data, key) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector for AES-GCM

    const encryptedData = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        dataBuffer
    );

    return { encryptedData, iv }; // Return both the encrypted data and IV
}

// Decrypt data (using AES-GCM)
async function decryptData(encryptedData, key, iv) {
    const decryptedData = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
}

// Save encrypted settings to Chrome storage
async function saveEncryptedSettings(settings) {
    const key = await generateEncryptionKey(); // Generate a new encryption key (you should store this securely)
    const encryptedSettings = await encryptData(JSON.stringify(settings), key);

    // Store both encrypted settings and IV in Chrome storage
    chrome.storage.sync.set({
        encryptedSettings: encryptedSettings.encryptedData,
        iv: encryptedSettings.iv
    });
}

// Retrieve and decrypt settings from Chrome storage
async function getDecryptedSettings() {
    const storedData = await chrome.storage.sync.get(["encryptedSettings", "iv"]);

    if (storedData.encryptedSettings && storedData.iv) {
        const key = await generateEncryptionKey(); // Ideally, you should securely retrieve a saved key
        const decryptedData = await decryptData(storedData.encryptedSettings, key, storedData.iv);
        return JSON.parse(decryptedData);
    }

    return {}; // Return an empty object if no settings are found
}

// Load encrypted settings and decrypt them
chrome.storage.sync.get(["encryptedSettings", "iv"], async (settings) => {
    if (settings.encryptedSettings && settings.iv) {
        // Decrypt the settings
        const decryptedSettings = await decryptData(settings.encryptedSettings, await generateEncryptionKey(), settings.iv);

        const parsedSettings = JSON.parse(decryptedSettings);

        if (parsedSettings.blockThirdPartyCookies !== undefined) adblocker.setBlockThirdPartyCookies(parsedSettings.blockThirdPartyCookies);
        if (parsedSettings.clearCookiesOnNavigation !== undefined) adblocker.setClearCookiesOnNavigation(parsedSettings.clearCookiesOnNavigation);
        if (parsedSettings.blockLocalStorage !== undefined) adblocker.setBlockLocalStorage(parsedSettings.blockLocalStorage);
        if (parsedSettings.blockSessionStorage !== undefined) adblocker.setBlockSessionStorage(parsedSettings.blockSessionStorage);
        if (parsedSettings.userWhitelist !== undefined) parsedSettings.userWhitelist.forEach(domain => adblocker.addWhitelistDomain(domain));
        if (parsedSettings.customBlockedDomains !== undefined) parsedSettings.customBlockedDomains.forEach(rule => adblocker.addCustomBlockRule(rule));
        if (parsedSettings.customCSSRules !== undefined) parsedSettings.customCSSRules.forEach(rule => adblocker.addCustomCSSRule(rule));
        if (parsedSettings.spoofUserAgent !== undefined) adblocker.setSpoofUserAgent(parsedSettings.spoofUserAgent);
        if (parsedSettings.spoofCanvas !== undefined) adblocker.setSpoofCanvas(parsedSettings.spoofCanvas);
        if (parsedSettings.spoofWebRTC !== undefined) adblocker.setSpoofWebRTC(parsedSettings.spoofWebRTC);
        if (parsedSettings.blockFonts !== undefined) adblocker.setBlockFonts(parsedSettings.blockFonts);
        if (parsedSettings.blockImages !== undefined) adblocker.setBlockImages(parsedSettings.blockImages);
        if (parsedSettings.blockedResourceTypes !== undefined) parsedSettings.blockedResourceTypes.forEach(type => adblocker.addBlockedResourceType(type));

        // Initialize the adblocker after loading settings
        adblocker.init();
    }
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
        saveEncryptedSettings({ blockThirdPartyCookies: request.value });
    } else if (request.action === 'setClearCookiesOnNavigation') {
        adblocker.setClearCookiesOnNavigation(request.value);
        saveEncryptedSettings({ clearCookiesOnNavigation: request.value });
    } else if (request.action === 'addWhitelistDomain') {
        adblocker.addWhitelistDomain(request.domain);
        chrome.storage.sync.get({ userWhitelist: [] }, (data) => {
            const newList = [...data.userWhitelist, request.domain];
            saveEncryptedSettings({ userWhitelist: newList });
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


// Function to set DNS-over-HTTPS (DoH)
function setDNSLeakProtection() {
    // Use DNS-over-HTTPS provider, e.g., Cloudflare or Google DNS
    const dnsProvider = 'https://cloudflare-dns.com/dns-query';

    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            // Redirect DNS requests to secure DNS provider
            return { redirectUrl: dnsProvider + '?dns=' + encodeURIComponent(details.url) };
        },
        { urls: ['http://*/dns-query', 'https://*/dns-query'] },
        ['blocking']
    );
}


function spoofFingerprint() {
    // Spoof screen resolution
    Object.defineProperty(window.screen, 'width', { value: 1920 });
    Object.defineProperty(window.screen, 'height', { value: 1080 });

    // Spoof navigator properties
    Object.defineProperty(navigator, 'platform', { value: 'Win32' });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

    // Spoof font properties
    document.fonts = new Proxy(document.fonts, {
        get: function (target, prop) {
            if (prop === 'check') {
                return () => false; // Disable font detection
            }
            return target[prop];
        }
    });
}

async function encryptData(data, key) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector

    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBuffer
    );

    return { encryptedData, iv };
}

async function decryptData(encryptedData, key, iv) {
    const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
}

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Block requests to Google Analytics and other Google services
        if (details.url.includes('google-analytics.com') || details.url.includes('google.com')) {
            return { cancel: true };
        }
    },
    { urls: ['<all_urls>'] },
    ['blocking']
);


function spoofGeoLocation() {
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
        // Provide a spoofed latitude and longitude
        success({ coords: { latitude: 40.7128, longitude: -74.0060 } }); // Example: New York coordinates
    };
}


function blockMaliciousRequests() {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            // Block known ad domains and trackers
            const blockedDomains = [
                'doubleclick.net', 
                'ad.doubleclick.net',
                'ads.google.com'
            ];

            for (let domain of blockedDomains) {
                if (details.url.includes(domain)) {
                    return { cancel: true }; // Block the request
                }
            }
        },
        { urls: ['<all_urls>'] },
        ['blocking']
    );
}

function enableDNSOverHTTPS() {
    const doHProvider = 'https://cloudflare-dns.com/dns-query'; // Cloudflare DoH provider

    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            return { redirectUrl: doHProvider + '?dns=' + encodeURIComponent(details.url) };
        },
        { urls: ['http://*/dns-query', 'https://*/dns-query'] },
        ['blocking']
    );
}
// Initialize all privacy features
function initPrivacyFeatures() {
    setDNSLeakProtection();
    spoofFingerprint();
    enableVPN();  // Only if VPN spoofing is integrated
    spoofGeoLocation();
    blockMaliciousRequests();
    enableDNSOverHTTPS();
}

// Call it when the extension starts
initPrivacyFeatures();

async function encryptData(data, key) {
    try {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encryptedData = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            dataBuffer
        );

        return { encryptedData, iv };
    } catch (error) {
        console.error("Encryption failed:", error);
        throw new Error('Encryption process failed');
    }
}

chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js'] // content.js should handle storage clearing
});
function spoofWebGL() {
    const originalWebGL = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
        if (type === 'webgl' || type === 'webgl2') {
            return {}; // Return a spoofed context
        }
        return originalWebGL.apply(this, arguments);
    };
}

