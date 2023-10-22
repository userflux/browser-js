export default class UserFlux {

    static ufApiKey = null;
    static ufUserId = UserFlux.getUserId() || null;
    static ufTrackQueue = UserFlux.loadEventsFromStorage('uf-track') || [];
    static ufAnonymousId = UserFlux.getOrCreateAnonymousId();

    static initialize(apiKey, options = {}) {
        UserFlux.ufApiKey = apiKey;
        UserFlux.startFlushInterval();

        if (options.autoPageTracking) {
            UserFlux.setupPageViewListener();
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
        UserFlux.#trackPageView();
    }

    static #trackPageView() {
        UserFlux.track('page_view', {
            url: window.location.href,
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
        let anonymousId = localStorage.getItem('uf-anonymousId');
        if (!anonymousId) {
            anonymousId = 'uf-' + crypto.randomUUID();
            localStorage.setItem('uf-anonymousId', anonymousId);
        }
        return anonymousId;
    }

    static getUserId() {
        return localStorage.getItem('uf-userId');
    }

    static setUserId(userId) {
        UserFlux.ufUserId = userId;
        localStorage.setItem('uf-userId', userId);
    }

    static loadEventsFromStorage(key) {
        const events = localStorage.getItem(key);
        return events ? JSON.parse(events) : [];
    }

    static reset() {
        localStorage.removeItem('uf-userId');
    }

    static startFlushInterval() {
        setInterval(() => {
            UserFlux.checkQueue(UserFlux.trackQueue, 'event/ingest/batch', true);
        }, 5000);
    }

    static identify(userId) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        UserFlux.setUserId(userId);

        const payload = {
            userId: userId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: {}
        };

        sendRequest('profile', payload)
    }

    static identify(attributes) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }

        const payload = {
            userId: UserFlux.ufUserId,
            anonymousId: UserFlux.ufAnonymousId,
            properties: attributes
        };
        
        sendRequest('profile', payload)
    }

    static identify(userId, attributes) {
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
        
        sendRequest('profile', payload)
    }

    static track(name, properties) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot track event.');
            return;
        }

        const payload = {
            timestamp: Date.now(),
            userId: UserFlux.ufUserId,
            anonymousId: UserFlux.ufAnonymousId,
            name: name,
            properties: properties
        };

        UserFlux.trackQueue.push(payload);
        UserFlux.saveEventsToStorage('uf-track', UserFlux.trackQueue);
        UserFlux.checkQueue(UserFlux.trackQueue, 'event/ingest/batch', false);
    }

    static saveEventsToStorage(key, queue) {
        localStorage.setItem(key, JSON.stringify(queue));
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
            body: JSON.stringify(data)
        })
        .then(response => {})
        .catch((error) => console.error('Error:', error));
    }

}
