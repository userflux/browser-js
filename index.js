const fetch = require('cross-fetch');

class UserFlux {

    static ufApiKey = null;
    static ufUserId = UserFlux.getUserId() || null;
    static ufTrackQueue = UserFlux.loadEventsFromStorage('uf-track') || [];
    static ufAnonymousId = UserFlux.getOrCreateAnonymousId();

    static initialize(apiKey, options) {
        UserFlux.ufApiKey = apiKey;
        UserFlux.startFlushInterval();

        if (options['autoCapture'] && options['autoCapture'] == true && typeof window !== 'undefined') {
            UserFlux.setupPageViewListener();
        }
    }

    static getStorage() {
        if (typeof window !== 'undefined') {
            return localStorage;
        } else {
            return null;
        }
    }

    static setupPageViewListener() {
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

        UserFlux.track('page_view', {
            title: document.title,
            referrer: document.referrer,
            referrerDomain: document.referrer ? new URL(document.referrer).hostname : null,
            path: window.location.pathname,
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
        return UserFlux.getStorage()?.getItem('uf-userId');
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
        }, 5000);
    }

    // TODO: make async
    static identify(attributes, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        if (userId == 'null') userId = null;
        UserFlux.setUserId(userId);

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: attributes,
            deviceData: UserFlux.getDeviceProperties()
        };

        UserFlux.sendRequest('profile', payload)
    }

    static track(name, properties, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        if (userId == 'null') userId = null;
        UserFlux.setUserId(userId);

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

    // TODO: make async
    static sendRequest(endpoint, data) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot send request.');
            return;
        }

        fetch(`https://integration-api.userflux.co/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${UserFlux.ufApiKey}`
            },
            body: JSON.stringify(data),
            keepalive: true
        })
        .then(response => {})
        .catch((error) => console.error('Error:', error));
    }

    static getDeviceProperties() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return null;
        }

        const userAgent = window.navigator.userAgent;
        let browser, browserVersion, deviceType, os;

        // Determine Browser and Browser Version
        if (userAgent.indexOf('Chrome') > -1) {
            browser = 'Chrome';
            browserVersion = userAgent.match(/Chrome\/(\d+)/)[1];
        } else if (userAgent.indexOf('Safari') > -1) {
            browser = 'Safari';
            browserVersion = userAgent.match(/Version\/([\d.]+)/)[1];
        } else if (userAgent.indexOf('Firefox') > -1) {
            browser = 'Firefox';
            browserVersion = userAgent.match(/Firefox\/([\d.]+)/)[1];
        } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident') > -1) {
            browser = 'Internet Explorer';
            browserVersion = userAgent.match(/(?:MSIE |rv:)(\d+)/)[1];
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
        if (userAgent.indexOf('Mac OS X') > -1) {
            os = 'Mac OS X';
        } else if (userAgent.indexOf('Windows NT') > -1) {
            os = 'Windows';
        } else if (userAgent.indexOf('Linux') > -1) {
            os = 'Linux';
        } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
            os = 'iOS';
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
    }

    static getUTMProperties() {
        // Check if running in a browser environment
        if (typeof window === 'undefined') {
            return null;
        }

        let locationHref = window.location.href;

        // Extract query parameters
        const urlSearchParams = new URLSearchParams(new URL(locationHref).search);
        let queryParams = {
            utm_source: urlSearchParams.get('utm_source') || null,
            utm_medium: urlSearchParams.get('utm_medium') || null,
            utm_campaign: urlSearchParams.get('utm_campaign') || null,
            utm_term: urlSearchParams.get('utm_term') || null,
            utm_content: urlSearchParams.get('utm_content') || null,
            utm_id: urlSearchParams.get('utm_id') || null,
            utm_source_platform: urlSearchParams.get('utm_source_platform') || null
        };

        return queryParams;
    }

}

module.exports = UserFlux;
