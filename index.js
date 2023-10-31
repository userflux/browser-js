const fetch = require('cross-fetch');

class UserFlux {

    static ufApiKey = null;
    static ufUserId = UserFlux.getUserId() || null;
    static ufTrackQueue = UserFlux.loadEventsFromStorage('uf-track') || [];
    static ufAnonymousId = UserFlux.getOrCreateAnonymousId();

    static initialize(apiKey, options) {
        UserFlux.ufApiKey = apiKey;
        UserFlux.startFlushInterval();

        if (options['autoCapturePageViews'] && options['autoCapturePageViews'] == true && typeof window !== 'undefined') {
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
            UserFlux.#trackPageView();
        };

        // Track page views on popstate (back/forward navigation)
        window.addEventListener('popstate', UserFlux.#trackPageView);

        // Track initial page view
        UserFlux.#trackPageView();
    }

    static #trackPageView() {
        UserFlux.track('page_view', {
            title: document.title,
            referrer: document.referrer,
            referrerDomain: document.referrer ? new URL(document.referrer).hostname : null,
            path: window.location.pathname
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
        UserFlux.getStorage()?.removeItem('uf-userId');
    }

    static startFlushInterval() {
        setInterval(() => {
            UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', true);
        }, 5000);
    }

    static identify(attributes, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        UserFlux.setUserId(userId);

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: attributes
        };

        UserFlux.sendRequest('profile', payload)
    }

    static track(name, properties, userId = UserFlux.ufUserId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        UserFlux.setUserId(userId);

        const payload = {
            timestamp: Date.now(),
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            name: name,
            properties: properties
        };

        UserFlux.ufTrackQueue.push(payload);
        UserFlux.saveEventsToStorage('uf-track', UserFlux.ufTrackQueue);
        UserFlux.checkQueue(UserFlux.ufTrackQueue, 'event/ingest/batch', false);
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

}

module.exports = UserFlux;
