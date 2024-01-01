const fetch = require('cross-fetch');

class UserFlux {

    static ufApiKey = null;
    static ufUserId = null;
    static ufTrackQueue = [];
    static ufAnonymousId = '';
    static ufAllowCookies = false;
    static ufLocationEnrichmentEnabled = true;
    static ufDeviceDataEnrichmentEnabled = true;
    static ufDefaultTrackingProperties = {};

    static initialize(apiKey, options) {
        try {
            UserFlux.ufApiKey = apiKey;

            if ('allowCookies' in options && options['allowCookies'] == true) {
                UserFlux.ufAllowCookies = true;
            }

            UserFlux.ufAnonymousId = UserFlux.getOrCreateAnonymousId();
            UserFlux.ufUserId = UserFlux.getUserId();
            UserFlux.ufTrackQueue = UserFlux.loadEventsFromStorage();

            if ('autoEnrich' in options && options['autoEnrich'] == false) {
                UserFlux.ufLocationEnrichmentEnabled = false;
                UserFlux.ufDeviceDataEnrichmentEnabled = false;
            }

            if ('defaultTrackingProperties' in options && typeof options['defaultTrackingProperties'] === 'object') {
                UserFlux.ufDefaultTrackingProperties = options['defaultTrackingProperties'];
            }

            UserFlux.startFlushInterval();

            if ('autoCapture' in options) {
                UserFlux.setupAutoTracking(options['autoCapture']);
            }
        } catch (error) {
            console.error('Failed to initialize UserFlux SDK: ', error);
        }
    }

    static updateDefaultTrackingProperties(properties) {
        if (typeof properties !== 'object') {
            console.error('UF defaultTrackingProperties must be an object.');
            return;
        }
        
        UserFlux.ufDefaultTrackingProperties = properties;
    }

    static getStorage() {
        if (typeof window === 'undefined') {
            return null;
        }

        return {
            setItem: (key, value) => {
                localStorage.setItem(key, value);
                if (UserFlux.ufAllowCookies == true) this.setCookie(key, value, 365);
            },
            getItem: (key) => {
                return localStorage.getItem(key) || ((UserFlux.ufAllowCookies == true) ? this.getCookie(key) : null);
            },
            removeItem: (key) => {
                localStorage.removeItem(key);
                if (UserFlux.ufAllowCookies == true) this.eraseCookie(key);
            }
        };
    }

    static setupAutoTracking(autoCaptureOptions) {
        if (typeof autoCaptureOptions !== 'object') { // The typeof operator returns " object " for arrays because in JavaScript arrays are objects.
            console.error('UF autoCapture must be an array.');
            return;
        }

        if (autoCaptureOptions.includes('page_views') || autoCaptureOptions.includes('all')) {
            UserFlux.setupPageViewListener();
        }

        if (autoCaptureOptions.includes('page_leaves') || autoCaptureOptions.includes('all')) {
            UserFlux.setupPageLeaveListener();
        }

        if (autoCaptureOptions.includes('clicks') || autoCaptureOptions.includes('all')) {
            UserFlux.setupClickListener();
        }
    }

    static setupPageViewListener() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return;
        }

        window.addEventListener("pageshow", (event) => { 
            UserFlux.trackPageView(); 
        });
    }

    static setupPageLeaveListener() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return;
        }

        window.addEventListener('pagehide', (event) => {
            UserFlux.trackPageLeave();
        });
    }

    static trackPageView() {
        UserFlux.track({
            event: 'page_view', 
            properties: {
                ...UserFlux.getPageProperties(),
                ...UserFlux.getReferrerProperties() || {},
                ...UserFlux.getUTMProperties() || {}
            },
            addToQueue: true
        });
    }

    static setupClickListener() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return;
        }

        document.addEventListener('click', (event) => {
            const element = event.target.closest('a, button, input[type="submit"], input[type="button"]');

            // If the clicked element or its parent is not what we want to track, return early.
            if (!element) return;

            UserFlux.trackClick(element);
        });
    }

    static trackClick(element) {
        const properties = {
            elementTagName: element.tagName,
            elementInnerText: element.innerText && element.innerText.length < 200 ? element.innerText.trim() : undefined,
            elementId: element.id && element.id !== '' ? element.id : undefined,
            ...UserFlux.getPageProperties()
        };

        // Filter out properties that are undefined
        const filteredProperties = Object.keys(properties).reduce((obj, key) => {
            if (properties[key] !== undefined) {
                obj[key] = properties[key];
            }
            return obj;
        }, {});

        UserFlux.track({
            event: 'click', 
            properties: {
                ...filteredProperties
            },
            addToQueue: true
        });
    }

    static trackPageLeave() {
        UserFlux.track({
            event: 'page_leave', 
            properties: {
                ...UserFlux.getPageProperties()
            },
            addToQueue: true
        });
    }

    static isApiKeyProvided() {
        return UserFlux.ufApiKey !== null;
    }

    static getOrCreateAnonymousId() {
        let anonymousId = UserFlux.getStorage()?.getItem('uf-anonymousId');

        if (!anonymousId) {
            anonymousId = UserFlux.generateUUID();
            UserFlux.getStorage()?.setItem('uf-anonymousId', anonymousId);
        } else {
            // Update anonymousId in local storage to prevent it from expiring
            UserFlux.getStorage()?.setItem('uf-anonymousId', anonymousId);
        }

        return anonymousId;
    }

    static createNewAnonymousId() {
        return UserFlux.generateUUID();
    }

    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    static getUserId() {
        let userId = UserFlux.getStorage()?.getItem('uf-userId');
        
        // clean up any wrongly stored user ids
        let shouldForceUpdate = false;
        if (userId == 'null' || userId == '' || userId == 'undefined') {
            userId = null;
            shouldForceUpdate = true;
        }

        if (userId || shouldForceUpdate) {
            // Update userId in local storage to prevent it from expiring
            UserFlux.getStorage()?.setItem('uf-userId', userId);
        }

        return userId;
    }

    static getAnonymousId() {
        return UserFlux.getOrCreateAnonymousId();
    }

    static setUserId(userId) {
        UserFlux.ufUserId = userId;
        UserFlux.getStorage()?.setItem('uf-userId', userId);
    }

    static loadEventsFromStorage() {
        try {
            const events = UserFlux.getStorage()?.getItem('uf-track');
            return events ? JSON.parse(events) : [];
        } catch (error) {
            console.error('Failed to get tracking events from storage: ', error);
            UserFlux.getStorage()?.removeItem('uf-track');
            return [];
        }
    }

    static reset() {
        // Firstly, flush any pending events
        UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', true);

        // Clear all stored data
        UserFlux.ufUserId = null;
        UserFlux.getStorage()?.removeItem('uf-userId');

        UserFlux.ufAnonymousId = null;
        UserFlux.getStorage()?.removeItem('uf-anonymousId');

        UserFlux.ufAnonymousId = UserFlux.createNewAnonymousId();
        UserFlux.getStorage()?.setItem('uf-anonymousId', UserFlux.ufAnonymousId);
    }

    static startFlushInterval() {
        setInterval(() => {
            UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', true);
        }, 1500);
    }

    static async identify(parameters) {
        // sanity check API key
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        // sanity check parameters
        if (!parameters || typeof parameters !== 'object') {
            console.error('Invalid parameters passed to track method');
            return;
        }

        // sanity check userId
        let userId = parameters.userId || UserFlux.ufUserId;
        if (userId && (typeof userId !== 'string' || userId == 'null' || userId == '' || userId == 'undefined')) userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        // sanity check properties
        const properties = parameters.properties || {};
        if (typeof properties !== 'object') {
            console.error('Invalid properties passed to identify method');
            return;
        }

        // sanity check enrichDeviceData
        const enrichDeviceData = parameters.enrichDeviceData || UserFlux.ufDeviceDataEnrichmentEnabled;
        if (typeof enrichDeviceData !== 'boolean') {
            console.error('Invalid enrichDeviceData passed to identify method');
            return;
        }

        // sanity check enrichLocationData
        const enrichLocationData = parameters.enrichLocationData || UserFlux.ufLocationEnrichmentEnabled;
        if (typeof enrichLocationData !== 'boolean') {
            console.error('Invalid enrichLocationData passed to identify method');
            return;
        }

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: properties,
            deviceData: enrichDeviceData ? UserFlux.getDeviceProperties() : null
        };

        return await UserFlux.sendRequest('profile', payload, enrichLocationData);
    }

    static async track(parameters) {
        // sanity check API key
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        // sanity check parameters
        if (!parameters || typeof parameters !== 'object') {
            console.error('Invalid parameters passed to track method');
            return;
        }

        // sanity check event
        const event = parameters.event;
        if (!event || typeof event !== 'string' || event == 'null' || event == '' || event == 'undefined') {
            console.error('Invalid event passed to track method');
            return;
        }

        // sanity check userId
        let userId = parameters.userId || UserFlux.ufUserId;
        if (userId && (typeof userId !== 'string' || userId == 'null' || userId == '' || userId == 'undefined')) userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        // sanity check properties
        const properties = parameters.properties || {};
        if (typeof properties !== 'object') {
            console.error('Invalid properties passed to track method');
            return;
        }

        // sanity check enrichDeviceData
        const enrichDeviceData = parameters.enrichDeviceData || UserFlux.ufDeviceDataEnrichmentEnabled;
        if (typeof enrichDeviceData !== 'boolean') {
            console.error('Invalid enrichDeviceData passed to track method');
            return;
        }

        // sanity check enrichLocationData
        const enrichLocationData = parameters.enrichLocationData || UserFlux.ufLocationEnrichmentEnabled;
        if (typeof enrichLocationData !== 'boolean') {
            console.error('Invalid enrichLocationData passed to track method');
            return;
        }

        const enrichPageProperties = parameters.enrichPageProperties || false;
        if (typeof enrichPageProperties !== 'boolean') {
            console.error('Invalid enrichPageProperties passed to track method');
            return;
        }

        const enrichReferrerProperties = parameters.enrichReferrerProperties || false;
        if (typeof enrichReferrerProperties !== 'boolean') {
            console.error('Invalid enrichReferrerProperties passed to track method');
            return;
        }

        const enrichUTMProperties = parameters.enrichUTMProperties || false;
        if (typeof enrichUTMProperties !== 'boolean') {
            console.error('Invalid enrichUTMProperties passed to track method');
            return;
        }

        // sanity check addToQueue
        const addToQueue = parameters.addToQueue || false;
        if (typeof addToQueue !== 'boolean') {
            console.error('Invalid addToQueue passed to track method');
            return;
        }

        // combine event properties with any default tracking properties
        const finalProperties = {
            ...properties,
            ...UserFlux.ufDefaultTrackingProperties,
            ...enrichPageProperties ? UserFlux.getPageProperties() : {},
            ...enrichReferrerProperties ? UserFlux.getReferrerProperties() : {},
            ...enrichUTMProperties ? UserFlux.getUTMProperties() : {}
        };

        const payload = {
            timestamp: Date.now(),
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            name: event,
            properties: finalProperties,
            deviceData: enrichDeviceData ? UserFlux.getDeviceProperties() : null
        };

        if (addToQueue) {
            const shouldForceFlush = (UserFlux.getStorage() == null);
            UserFlux.ufTrackQueue.push(payload);
            UserFlux.saveEventsToStorage('uf-track', UserFlux.ufTrackQueue);
            UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', shouldForceFlush);
            return null;
        } else {
            return await UserFlux.sendRequest('event/ingest/batch', { events: [payload] }, enrichLocationData);
        }
    }

    static saveEventsToStorage(key, queue) {
        UserFlux.getStorage()?.setItem(key, JSON.stringify(queue));
    }

    static checkQueue(queue, eventType, forceFlush) {
        if (queue.length >= 10 || (forceFlush && queue.length > 0)) {
            UserFlux.flushEvents(queue, eventType);
        }
    }

    static flushEvents(queue, eventType) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot flush events.');
            return;
        }

        UserFlux.sendRequest(eventType, { events: queue.splice(0, 10) });
        UserFlux.saveEventsToStorage(`uf-track`, queue);
    }

    static async sendRequest(endpoint, data, locationEnrich = UserFlux.ufLocationEnrichmentEnabled) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot send request.');
            return;
        }

        try {
            return await fetch(`https://integration-api.userflux.co/${endpoint}?locationEnrichment=${locationEnrich}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${UserFlux.ufApiKey}`
                },
                body: JSON.stringify(data),
                keepalive: true
            });
        } catch (error) {
            console.error('UF Error: ', error);
        }
    }

    static getPageProperties() {
        try {
            // Check if running in a browser environment
            if (typeof window === 'undefined') {
                return {};
            }

            return {
                host: window.location.host,
                href: window.location.href,
                path: window.location.pathname,
                pageTitle: document.title
            };
        } catch (e) {
            console.error('Error on getPageProperties:', error)
            return {};
        }
    }

    static getDeviceProperties() {
        try {
            // Check if running in a browser environment
            if (typeof window === 'undefined') {
                return null;
            }

            const userAgent = window.navigator.userAgent;
            let browser, browserVersion, deviceType, os;

            // Determine Browser and Browser Version
            if (userAgent.indexOf('Chrome') > -1) {
                browser = 'Chrome';
                const match = userAgent.match(/Chrome\/(\d+)/);
                browserVersion = match ? match[1] : 'Unknown';
            } else if (userAgent.indexOf('CriOS') > -1) {
                browser = 'Chrome';
                const match = userAgent.match(/CriOS\/([\d.]+)/);
                browserVersion = match ? match[1] : 'Unknown';
            } else if (userAgent.indexOf('Safari') > -1) {
                browser = 'Safari';
                const match = userAgent.match(/Version\/([\d.]+)/);
                browserVersion = match ? match[1] : 'Unknown';
            } else if (userAgent.indexOf('Firefox') > -1) {
                browser = 'Firefox';
                const match = userAgent.match(/Firefox\/([\d.]+)/);
                browserVersion = match ? match[1] : 'Unknown';
            } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident') > -1) {
                browser = 'Internet Explorer';
                const match = userAgent.match(/(?:MSIE |rv:)(\d+)/);
                browserVersion = match ? match[1] : 'Unknown';
            } else {
                browser = 'Unknown';
                browserVersion = 'Unknown';
            }

            // Determine Device Type
            if (/Mobi|Android/i.test(userAgent)) {
                deviceType = 'Mobile';
            } else {
                deviceType = 'Desktop';
            }

            // Determine OS
            if (/iPhone|iPad|iPod/i.test(userAgent)) {
                os = 'iOS';
            } else if (userAgent.indexOf('Mac OS X') > -1) {
                os = 'Mac OS X';
            } else if (userAgent.indexOf('Windows NT') > -1) {
                os = 'Windows';
            } else if (userAgent.indexOf('Android') > -1) {
                os = 'Android';
            } else if (userAgent.indexOf('Linux') > -1) {
                os = 'Linux';
            } else {
                os = 'Unknown';
            }

            return {
                userAgent: userAgent,
                browser: browser,
                browserVersion: browserVersion,
                deviceType: deviceType,
                os: os,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                browserWidth: window.innerWidth,
                browserHeight: window.innerHeight
            };
        } catch (error) {
            console.error('Error:', error)
            return null;
        }
    }

    static getUTMProperties() {
        try {
            // Check if running in a browser environment
            if (typeof window === 'undefined') {
                return null;
            }

            let locationHref = window.location.href;

            // Extract query parameters
            const urlSearchParams = new URLSearchParams(new URL(locationHref).search);
            let queryParams = {
                utmSource: urlSearchParams.get('utm_source') || null,
                utmMedium: urlSearchParams.get('utm_medium') || null,
                utmCampaign: urlSearchParams.get('utm_campaign') || null,
                utmTerm: urlSearchParams.get('utm_term') || null,
                utmContent: urlSearchParams.get('utm_content') || null,
                utmId: urlSearchParams.get('utm_id') || null,
                utmSourcePlatform: urlSearchParams.get('utm_source_platform') || null
            };

            return queryParams;
        } catch (error) {
            console.error('Error: ', error)
            return null;
        }
    }

    static getReferrerProperties() {
        try {
            // Check if running in a browser environment
            if (typeof window === 'undefined') {
                return null;
            }

            return {
                referrerHref: (document.referrer !== '') ? document.referrer : null,
                referrerHost: document.referrer ? new URL(document.referrer).hostname : null,
            }
        } catch (error) {
            console.error('Error: ', error)
            return null;
        }
    }

    // Utility function to set a cookie
    static setCookie(name, value, days) {
        try {
            let expires = "";
            
            if (days) {
                const date = new Date();
                date.setTime(date.getTime() + (days*24*60*60*1000));
                expires = "; expires=" + date.toUTCString();
            }

            // Set SameSite to Lax
            const sameSite = "; SameSite=Lax";
            // Lax is compatible with both secure and non-secure sites, but using Secure when available is better
            const secure = window.location.protocol === 'https:' ? "; Secure" : "";

            // Dynamically determine the base domain
            const hostMatchRegex = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i
            const matches = document.location.hostname.match(hostMatchRegex);
            const domain = matches ? '; domain=.' + matches[0] : '';
        
            document.cookie = name + "=" + (value || "")  + expires + sameSite + secure + domain + "; path=/";
        } catch (error) {
            console.error('Error:', error)
        }
    }

    // Utility function to get a cookie
    static getCookie(name) {
        try {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for(let i=0;i < ca.length;i++) {
                let c = ca[i];
                while (c.charAt(0)==' ') c = c.substring(1,c.length);
                if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
            }
            return null;
        } catch (error) {
            console.error('Error:', error)
            return null;
        }
    }

    // Utility function to erase a cookie
    static eraseCookie(name) {
        try {
            // Dynamically determine the base domain
            const hostMatchRegex = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i
            const matches = document.location.hostname.match(hostMatchRegex);
            const domain = matches ? '; domain=.' + matches[0] : '';

            document.cookie = name+'=; Max-Age=-99999999; path=/' + '; domain=.' + domain;
        } catch (error) {
            console.error('Error:', error);
        }
    }

}

module.exports = UserFlux;
