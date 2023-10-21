export default class UserFlux {

    static apiKey = null;
    static trackQueue = UserFlux.loadEventsFromStorage('uf-track') || [];
    static anonymousId = UserFlux.getOrCreateAnonymousId();

    static initialize(apiKey, options = {}) {
        UserFlux.apiKey = apiKey;
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
        return UserFlux.apiKey !== null;
    }

    static getOrCreateAnonymousId() {
        let anonymousId = localStorage.getItem('uf-anonymousId');
        if (!anonymousId) {
            anonymousId = 'uf-' + crypto.randomUUID();
            localStorage.setItem('uf-anonymousId', anonymousId);
        }
        return anonymousId;
    }

    static loadEventsFromStorage(key) {
        const events = localStorage.getItem(key);
        return events ? JSON.parse(events) : [];
    }

    static startFlushInterval() {
        setInterval(() => {
            UserFlux.checkQueue(UserFlux.trackQueue, 'event/ingest/batch', true);
        }, 5000);
    }

    static identify(attributes) {
        if (!UserFlux.isApiKeyProvided()) {
            console.error('API key not provided. Cannot identify user.');
            return;
        }
        const payload = {
            userId: null,
            anonymousId: UserFlux.anonymousId,
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
            userId: null,
            anonymousId: UserFlux.anonymousId,
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
                'Authorization': `Bearer ${UserFlux.apiKey}`
            },
            body: JSON.stringify(data)
        })
        .then(response => {})
        .catch((error) => console.error('Error:', error));
    }

}
