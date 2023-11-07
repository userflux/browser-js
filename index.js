const fetch = require('cross-fetch');

class UserFlux {

    static ufApiKey = null;
    static ufUserId = null;
    static ufTrackQueue = [];
    static ufAnonymousId = '';
    static ufAllowCookies = false;
    static ufLocationEnrichmentEnabled = true;

    static initialize(apiKey, options) {
        try {
            UserFlux.ufApiKey = apiKey;

            if ('allowCookies' in options && options['allowCookies'] == true) {
                UserFlux.ufAllowCookies = true;
            }

            UserFlux.ufAnonymousId = UserFlux.getOrCreateAnonymousId();
            UserFlux.ufUserId = UserFlux.getUserId();
            UserFlux.ufTrackQueue = UserFlux.loadEventsFromStorage('uf-track');

            if ('autoEnrich' in options && options['autoEnrich'] == false) {
                UserFlux.ufLocationEnrichmentEnabled = false;
            }

            UserFlux.startFlushInterval();

            if ('autoCapture' in options && options['autoCapture'] == true) {
                UserFlux.setupPageViewListener();
            }
        } catch (error) {
            console.error('Failed to initialize UserFlux SDK: ', error);
        }
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

    static setupPageViewListener() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return;
        }

        // Store original pushState function
        const originalPushState = history.pushState;

        // Override pushState to track page views
        history.pushState = function() {
            originalPushState.apply(this, arguments);
            UserFlux.trackPageView();
        };

        // Track page views on popstate (back/forward navigation)
        window.addEventListener('popstate', UserFlux.trackPageView);

        // Track initial page view
        UserFlux.trackPageView();
    }

    static trackPageView() {
        const utmProperties = UserFlux.getUTMProperties() || {};

        UserFlux.trackUsingQueue('page_view', {
            host: window.location.host,
            href: window.location.href,
            path: window.location.pathname,
            pageTitle: document.title,
            referrerHref: document.referrer,
            referrerHost: document.referrer ? new URL(document.referrer).hostname : null,
            ...utmProperties
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

    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    static getUserId() {
        let userId = UserFlux.getStorage()?.getItem('uf-userId');

        if (userId) {
            // Update userId in local storage to prevent it from expiring
            UserFlux.getStorage()?.setItem('uf-userId', userId);
        }

        return userId;
    }

    static setUserId(userId) {
        UserFlux.ufUserId = userId;
        UserFlux.getStorage()?.setItem('uf-userId', userId);
    }

    static loadEventsFromStorage(key) {
        const events = UserFlux.getStorage()?.getItem(key);
        return events ? JSON.parse(events) : [];
    }

    static reset() {
        // Firstly, flush any pending events
        UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', true);

        // Clear all stored data
        UserFlux.getStorage()?.removeItem('uf-userId');
        UserFlux.getStorage()?.removeItem('uf-anonymousId');
    }

    static startFlushInterval() {
        setInterval(() => {
            UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', true);
        }, 1500);
    }

    static identify(attributes, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        if (userId == 'null' || userId == '' || userId == 'undefined') userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: attributes,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.sendRequest('profile', payload);
    }

    static identifyEnrichDisabled(attributes, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        if (userId == 'null' || userId == '' || userId == 'undefined') userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: attributes,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.sendRequest('profile', payload, false);
    }

    static track(name, properties, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        if (userId == 'null' || userId == '' || userId == 'undefined') userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        const payload = {
            timestamp: Date.now(),
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            name: name,
            properties: properties,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.sendRequest('event/ingest/batch', { events: [payload] });
    }

    static trackEnrichDisabled(name, properties, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        if (userId == 'null' || userId == '' || userId == 'undefined') userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        const payload = {
            timestamp: Date.now(),
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            name: name,
            properties: properties,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.sendRequest('event/ingest/batch', { events: [payload] }, false);
    }

    static trackUsingQueue(name, properties, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        if (userId == 'null' || userId == '' || userId == 'undefined') userId = null;
        if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId);

        const payload = {
            timestamp: Date.now(),
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            name: name,
            properties: properties,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.ufTrackQueue.push(payload);
        UserFlux.saveEventsToStorage('uf-track', UserFlux.ufTrackQueue);
        
        const shouldForceFlush = (UserFlux.getStorage() == null);
        UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', shouldForceFlush);
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
            const response = await fetch(`https://integration-api.userflux.co/${endpoint}?locationEnrichment=${locationEnrich}`, {
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
            } else if (userAgent.indexOf('Linux') > -1) {
                os = 'Linux';
            } else if (userAgent.indexOf('Android') > -1) {
                os = 'Android';
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
        document.cookie = name+'=; Max-Age=-99999999;';  
    }

}

module.exports = UserFlux;
