const fetch = require("cross-fetch")

class UserFlux {
	static ufApiKey = null
	static ufUserId = null
	static ufExternalId = null
	static ufTrackQueue = []
	static ufAnonymousId = ""
	static ufSessionId = null
	static ufAllowCookies = false
	static ufCookieSameSiteSetting = "Strict"
	static ufLocationEnrichmentEnabled = true
	static ufDeviceDataEnrichmentEnabled = true
	static ufDefaultTrackingProperties = {}
	static ufCustomQueryParamsToCollect = []
	static ufDisableUserIdStorage = false
	static ufCookieExpiryDays = 365

	static initialize(apiKey, options) {
		try {
			const shouldDisableCommonBotsBlocking = "blockCommonBots" in options && options["blockCommonBots"] == false
			if (!shouldDisableCommonBotsBlocking && UserFlux.isBotUserAgent(window.navigator.userAgent)) {
				console.info("Common bot detected. UserFlux SDK will not initialize.")
				return
			}

			UserFlux.ufApiKey = apiKey

			if ("allowCookies" in options && options["allowCookies"] == true) {
				UserFlux.ufAllowCookies = true
			}

			if ("cookieSameSiteSetting" in options && options["cookieSameSiteSetting"] == "Lax") {
				UserFlux.ufCookieSameSiteSetting = "Lax"
			}

			if ("cookieExpiryDays" in options && typeof options["cookieExpiryDays"] === "number") {
				UserFlux.ufCookieExpiryDays = options["cookieExpiryDays"]
			}

			if ("disableUserIdStorage" in options && options["disableUserIdStorage"] == true) {
				UserFlux.ufDisableUserIdStorage = true
			}

			UserFlux.ufAnonymousId = UserFlux.getOrCreateAnonymousId()
			UserFlux.ufUserId = UserFlux.getUserId()
			UserFlux.ufTrackQueue = UserFlux.loadEventsFromStorage()

			if ("trackSession" in options && options["trackSession"] == false) {
				// don't setup session id
			} else {
				UserFlux.setupSessionId()
			}

			if ("autoEnrich" in options && options["autoEnrich"] == false) {
				UserFlux.ufLocationEnrichmentEnabled = false
				UserFlux.ufDeviceDataEnrichmentEnabled = false
			}

			if ("defaultTrackingProperties" in options && typeof options["defaultTrackingProperties"] === "object") {
				UserFlux.ufDefaultTrackingProperties = options["defaultTrackingProperties"]
			}

			if (
				"customQueryParamsToCollect" in options &&
				Array.isArray(options["customQueryParamsToCollect"]) === true
			) {
				UserFlux.ufCustomQueryParamsToCollect = options["customQueryParamsToCollect"]
			}

			UserFlux.startFlushInterval()

			if ("autoCapture" in options) {
				UserFlux.setupAutoTracking(options["autoCapture"])
			}

			if (UserFlux.ufDisableUserIdStorage == true && UserFlux.ufUserId != null) {
				UserFlux.getStorage()?.removeItem("uf-userId")
			}
		} catch (error) {
			console.info("Failed to initialize UserFlux SDK: ", error)
		}
	}

	static updateDefaultTrackingProperties(properties) {
		if (typeof properties !== "object") {
			console.info("UF defaultTrackingProperties must be an object.")
			return
		}

		UserFlux.ufDefaultTrackingProperties = properties
	}

	static getStorage() {
		if (typeof window === "undefined") {
			return null
		}

		return {
			setItem: (key, value) => {
				try {
					let shouldSkipForLocalStorage = UserFlux.ufDisableUserIdStorage == true && key === "uf-userId"
					if (!shouldSkipForLocalStorage && UserFlux.isLocalStorageAccessible())
						localStorage.setItem(key, value)

					let shouldSkipForCookieStorage = key == "uf-track"
					if (UserFlux.ufAllowCookies == true && !shouldSkipForCookieStorage)
						UserFlux.setCookie(key, value, UserFlux.ufCookieExpiryDays)
				} catch (error) {
					console.info("Error setting item to storage: ", error)
				}
			},
			getItem: (key) => {
				try {
					return (
						(UserFlux.isLocalStorageAccessible() ? localStorage.getItem(key) : null) ||
						(UserFlux.ufAllowCookies == true ? UserFlux.getCookie(key) : null)
					)
				} catch (error) {
					console.info("Error getting item from storage: ", error)
					return null
				}
			},
			removeItem: (key) => {
				try {
					if (UserFlux.isLocalStorageAccessible()) localStorage.removeItem(key)
					if (UserFlux.ufAllowCookies == true) UserFlux.eraseCookie(key)
				} catch (error) {
					console.info("Error removing item from storage: ", error)
				}
			},
		}
	}

	static getSessionStorage() {
		if (typeof window === "undefined" || !UserFlux.isSessionStorageAccessible()) {
			return null
		}

		return {
			setItem: (key, value) => {
				try {
					sessionStorage.setItem(key, value)
				} catch (error) {
					console.info("Error setting item to session storage: ", error)
				}
			},
			getItem: (key) => {
				try {
					return sessionStorage.getItem(key)
				} catch (error) {
					console.info("Error getting item from session storage: ", error)
					return null
				}
			},
			removeItem: (key) => {
				try {
					sessionStorage.removeItem(key)
				} catch (error) {
					console.info("Error removing item from session storage: ", error)
				}
			},
		}
	}

	static setupSessionId() {
		try {
			if (!UserFlux.isSessionStorageAccessible()) {
				console.info("Session storage is not accessible. Session ID handling will be disabled.")
				UserFlux.clearSessionId()
				return
			}

			const currentSessionId = UserFlux.getSessionId()

			if (UserFlux.isStringNullOrBlank(currentSessionId)) {
				const newSessionId = UserFlux.generateUUID()
				UserFlux.setSessionId(newSessionId)
			}
		} catch (error) {
			console.info("Error setting up session ID: ", error)
		}
	}

	static setSessionId(newSessionId) {
		if (!UserFlux.isSessionStorageAccessible()) {
			return
		}

		try {
			UserFlux.ufSessionId = newSessionId
			UserFlux.getSessionStorage()?.setItem("uf-sessionId", newSessionId)
			if (UserFlux.ufAllowCookies == true) UserFlux.setCookie("uf-sessionId", newSessionId, 0.003) // 5 minutes in days
		} catch (error) {
			console.info("Error setting session ID: ", error)
		}
	}

	static getSessionId() {
		try {
			if (!UserFlux.isSessionStorageAccessible()) {
				return null
			}

			// fetch from memory
			if (!UserFlux.isStringNullOrBlank(UserFlux.ufSessionId)) {
				UserFlux.setSessionId(UserFlux.ufSessionId) // replenish storage
				return UserFlux.ufSessionId
			}

			// fetch from sesionStorage
			const idFromSessionStorage = UserFlux.getSessionStorage()?.getItem("uf-sessionId")
			if (!UserFlux.isStringNullOrBlank(idFromSessionStorage)) {
				UserFlux.setSessionId(idFromSessionStorage) // replenish storage
				return idFromSessionStorage
			}

			// fetch from cookie
			const idFromCookie = UserFlux.ufAllowCookies == true ? UserFlux.getCookie("uf-sessionId") : null
			if (!UserFlux.isStringNullOrBlank(idFromCookie)) {
				UserFlux.setSessionId(idFromCookie) // replenish storage
				return idFromCookie
			}

			// otherwise return null
			return null
		} catch (error) {
			console.info("Error getting session ID: ", error)
			return null
		}
	}

	static clearSessionId() {
		UserFlux.ufSessionId = null
	}

	static setupAutoTracking(autoCaptureOptions) {
		if (typeof autoCaptureOptions !== "object") {
			// The typeof operator returns " object " for arrays because in JavaScript arrays are objects.
			console.info("UF autoCapture must be an array.")
			return
		}

		if (autoCaptureOptions.includes("page_views") || autoCaptureOptions.includes("all")) {
			UserFlux.setupPageViewListener()
		}

		if (autoCaptureOptions.includes("page_leaves") || autoCaptureOptions.includes("all")) {
			UserFlux.setupPageLeaveListener()
		}

		if (autoCaptureOptions.includes("clicks") || autoCaptureOptions.includes("all")) {
			UserFlux.setupClickListener()
		}
	}

	static setupPageViewListener() {
		// Check if running in a browser environment
		if (typeof window === "undefined") {
			return
		}

		window.addEventListener("pageshow", async (event) => {
			await UserFlux.trackPageView()
		})
	}

	static setupPageLeaveListener() {
		// Check if running in a browser environment
		if (typeof window === "undefined") {
			return
		}

		// TBD: what's best to use pagehide or beforeunload
		window.addEventListener("pagehide", async (event) => {
			await UserFlux.trackPageLeave()
		})
	}

	static async trackPageView() {
		await UserFlux.track({
			event: "page_view",
			properties: {
				...UserFlux.getPageProperties(),
				...(UserFlux.getReferrerProperties() || {}),
				...(UserFlux.getUTMProperties() || {}),
				...(UserFlux.getPaidAdProperties() || {}),
			},
			addToQueue: false,
		})
	}

	static setupClickListener() {
		// Check if running in a browser environment
		if (typeof window === "undefined") {
			return
		}

		document.addEventListener("click", async (event) => {
			const element = event.target.closest('a, button, input[type="submit"], input[type="button"]')

			// If the clicked element or its parent is not what we want to track, return early.
			if (!element) return

			await UserFlux.trackClick(element)
		})
	}

	static async trackClick(element) {
		const properties = {
			elementTagName: element.tagName,
			elementInnerText:
				element.innerText && element.innerText.length < 200 ? element.innerText.trim() : undefined,
			elementId: element.id && element.id !== "" ? element.id : undefined,
			...UserFlux.getPageProperties(),
		}

		// Filter out properties that are undefined
		const filteredProperties = Object.keys(properties).reduce((obj, key) => {
			if (properties[key] !== undefined) {
				obj[key] = properties[key]
			}
			return obj
		}, {})

		await UserFlux.track({
			event: "click",
			properties: {
				...filteredProperties,
			},
			addToQueue: true,
		})
	}

	static async trackPageLeave() {
		await UserFlux.track({
			event: "page_leave",
			properties: {
				...UserFlux.getPageProperties(),
				...(UserFlux.getReferrerProperties() || {}),
				...(UserFlux.getUTMProperties() || {}),
				...(UserFlux.getPaidAdProperties() || {}),
			},
			addToQueue: true,
		})
	}

	static isApiKeyProvided() {
		return UserFlux.ufApiKey !== null
	}

	static getOrCreateAnonymousId() {
		let anonymousId
		if (UserFlux.isStringNullOrBlank(UserFlux.ufAnonymousId)) {
			// default value is '' which means it hasn't been set yet
			// fetch from storage, if it isn't there then create a new ID
			anonymousId = UserFlux.getStorage()?.getItem("uf-anonymousId") ?? UserFlux.createNewAnonymousId()
		} else {
			// otherwise value is set
			anonymousId = UserFlux.ufAnonymousId
		}

		// Update anonymousId in memory + local + cookie storage to prevent it from expiring
		UserFlux.ufAnonymousId = anonymousId
		UserFlux.getStorage()?.setItem("uf-anonymousId", anonymousId)

		return anonymousId
	}

	static createNewAnonymousId() {
		return UserFlux.generateUUID()
	}

	static generateUUID() {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
			let r = (Math.random() * 16) | 0,
				v = c == "x" ? r : (r & 0x3) | 0x8
			return v.toString(16)
		})
	}

	static getUserId() {
		let userId = UserFlux.ufUserId || UserFlux.getStorage()?.getItem("uf-userId")

		// clean up any wrongly stored user ids
		let shouldForceUpdate = false

		// handle edge case values
		if (UserFlux.isStringNullOrBlank(userId)) {
			userId = null
			shouldForceUpdate = true
		}

		if (userId || shouldForceUpdate) {
			// Update userId in local storage to prevent it from expiring
			UserFlux.getStorage()?.setItem("uf-userId", userId)
		}

		return userId
	}

	static getAnonymousId() {
		return UserFlux.getOrCreateAnonymousId()
	}

	static setUserId(userId) {
		UserFlux.ufUserId = userId
		UserFlux.getStorage()?.setItem("uf-userId", userId)
	}

	static setExternalId(externalId) {
		UserFlux.ufExternalId = externalId
		UserFlux.getStorage()?.setItem("uf-externalId", externalId)
	}

	static loadEventsFromStorage() {
		try {
			const events = UserFlux.getStorage()?.getItem("uf-track")
			return events ? JSON.parse(events) : []
		} catch (error) {
			console.info("Failed to get tracking events from storage: ", error)
			UserFlux.getStorage()?.removeItem("uf-track")
			return []
		}
	}

	static async reset() {
		// Firstly, flush any pending events
		await UserFlux.checkQueue(UserFlux.ufTrackQueue, "event/ingest/batch", true)

		// Clear all stored data
		UserFlux.ufUserId = null
		UserFlux.getStorage()?.removeItem("uf-userId")

		UserFlux.ufAnonymousId = null
		UserFlux.getStorage()?.removeItem("uf-anonymousId")

		UserFlux.ufAnonymousId = UserFlux.createNewAnonymousId()
		UserFlux.getStorage()?.setItem("uf-anonymousId", UserFlux.ufAnonymousId)

		UserFlux.ufExternalId = null
		UserFlux.getStorage()?.removeItem("uf-externalId")
	}

	static startFlushInterval() {
		setInterval(async () => {
			await UserFlux.checkQueue(UserFlux.ufTrackQueue, "event/ingest/batch", true)
		}, 1500)
	}

	static async identify(parameters) {
		// sanity check API key
		if (!UserFlux.isApiKeyProvided()) {
			console.info("API key not provided. Cannot identify user.")
			return
		}

		// sanity check parameters
		if (!parameters || typeof parameters !== "object") {
			console.info("Invalid parameters passed to track method")
			return
		}

		// sanity check userId
		let userId = parameters.userId || UserFlux.ufUserId
		if (userId && (typeof userId !== "string" || UserFlux.isStringNullOrBlank(userId))) userId = null
		if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId)

		// sanity check externalId
		let externalId = parameters.externalId || UserFlux.ufExternalId || UserFlux.getExternalIdQueryParam()
		if (externalId && (typeof externalId !== "string" || UserFlux.isStringNullOrBlank(externalId))) externalId = null
		if (externalId !== UserFlux.ufExternalId) UserFlux.setExternalId(externalId)

		// sanity check properties
		const properties = parameters.properties || {}
		if (typeof properties !== "object") {
			console.info("Invalid properties passed to identify method")
			return
		}

		// sanity check enrichDeviceData
		const enrichDeviceData = parameters.enrichDeviceData || UserFlux.ufDeviceDataEnrichmentEnabled
		if (typeof enrichDeviceData !== "boolean") {
			console.info("Invalid enrichDeviceData passed to identify method")
			return
		}

		// sanity check enrichLocationData
		const enrichLocationData = parameters.enrichLocationData || UserFlux.ufLocationEnrichmentEnabled
		if (typeof enrichLocationData !== "boolean") {
			console.info("Invalid enrichLocationData passed to identify method")
			return
		}

		const payload = {
			userId: userId,
			externalId: externalId,
			anonymousId: UserFlux.getOrCreateAnonymousId(),
			properties: properties,
			deviceData: enrichDeviceData ? UserFlux.getDeviceProperties() : null,
		}

		return await UserFlux.sendRequest("profile", payload, enrichLocationData)
	}

	static async track(parameters) {
		// sanity check API key
		if (!UserFlux.isApiKeyProvided()) {
			console.info("API key not provided. Cannot track event.")
			return
		}

		// sanity check parameters
		if (!parameters || typeof parameters !== "object") {
			console.info("Invalid parameters passed to track method")
			return
		}

		// sanity check event
		const event = parameters.event
		if (!event || typeof event !== "string" || UserFlux.isStringNullOrBlank(event)) {
			console.info("Invalid event passed to track method")
			return
		}

		// sanity check userId
		let userId = parameters.userId || UserFlux.ufUserId
		if (userId && (typeof userId !== "string" || UserFlux.isStringNullOrBlank(userId))) userId = null
		if (userId !== UserFlux.ufUserId) UserFlux.setUserId(userId)

		// sanity check externalId
		let externalId = parameters.externalId || UserFlux.ufExternalId || UserFlux.getExternalIdQueryParam()
		if (externalId && (typeof externalId !== "string" || UserFlux.isStringNullOrBlank(externalId))) externalId = null
		if (externalId !== UserFlux.ufExternalId) UserFlux.setExternalId(externalId)

		// sanity check properties
		const properties = parameters.properties || {}
		if (typeof properties !== "object") {
			console.info("Invalid properties passed to track method")
			return
		}

		// sanity check enrichDeviceData
		const enrichDeviceData = parameters.enrichDeviceData || UserFlux.ufDeviceDataEnrichmentEnabled
		if (typeof enrichDeviceData !== "boolean") {
			console.info("Invalid enrichDeviceData passed to track method")
			return
		}

		// sanity check enrichLocationData
		const enrichLocationData = parameters.enrichLocationData || UserFlux.ufLocationEnrichmentEnabled
		if (typeof enrichLocationData !== "boolean") {
			console.info("Invalid enrichLocationData passed to track method")
			return
		}

		const enrichPageProperties = parameters.enrichPageProperties || true
		if (typeof enrichPageProperties !== "boolean") {
			console.info("Invalid enrichPageProperties passed to track method")
			return
		}

		const enrichReferrerProperties = parameters.enrichReferrerProperties || true
		if (typeof enrichReferrerProperties !== "boolean") {
			console.info("Invalid enrichReferrerProperties passed to track method")
			return
		}

		const enrichUTMProperties = parameters.enrichUTMProperties || true
		if (typeof enrichUTMProperties !== "boolean") {
			console.info("Invalid enrichUTMProperties passed to track method")
			return
		}

		const enrichPaidAdProperties = parameters.enrichPaidAdProperties || true
		if (typeof enrichPaidAdProperties !== "boolean") {
			console.info("Invalid enrichPaidAdProperties passed to track method")
			return
		}

		// sanity check addToQueue
		const addToQueue = parameters.addToQueue || false
		if (typeof addToQueue !== "boolean") {
			console.info("Invalid addToQueue passed to track method")
			return
		}

		// combine event properties with any default tracking properties
		const finalProperties = {
			...properties,
			...UserFlux.ufDefaultTrackingProperties,
			...(enrichPageProperties ? UserFlux.getPageProperties() : {}),
			...(enrichReferrerProperties ? UserFlux.getReferrerProperties() : {}),
			...(enrichUTMProperties ? UserFlux.getUTMProperties() : {}),
			...(enrichPaidAdProperties ? UserFlux.getPaidAdProperties() : {}),
			...(UserFlux.getCustomQueryParamProperties() || {}),
		}

		const payload = {
			timestamp: Date.now(),
			userId: userId,
			anonymousId: UserFlux.getOrCreateAnonymousId(),
			externalId: externalId,
			sessionId: UserFlux.getSessionId(),
			name: event,
			properties: finalProperties,
			deviceData: enrichDeviceData ? UserFlux.getDeviceProperties() : null,
		}

		const shouldForceFlush = UserFlux.getStorage() == null || addToQueue == false
		UserFlux.ufTrackQueue.push(payload)
		UserFlux.saveEventsToStorage("uf-track", UserFlux.ufTrackQueue)
		await UserFlux.checkQueue(UserFlux.ufTrackQueue, "event/ingest/batch", shouldForceFlush)
		return null
	}

	static async trackBatch(events) {
		for (const event of events) {
			await UserFlux.track({ ...event, addToQueue: true })
		}

		await UserFlux.flush()
		return
	}

	static async flush() {
		await UserFlux.checkQueue(UserFlux.ufTrackQueue, "event/ingest/batch", true)
	}

	static saveEventsToStorage(key, queue) {
		UserFlux.getStorage()?.setItem(key, JSON.stringify(queue))
	}

	static async checkQueue(queue, eventType, forceFlush) {
		if (queue.length >= 10 || (forceFlush && queue.length > 0)) {
			await UserFlux.flushEvents(queue, eventType)
		}
	}

	static async flushEvents(queue, eventType) {
		if (!UserFlux.isApiKeyProvided()) {
			console.info("API key not provided. Cannot flush events.")
			return
		}

		const eventsToTrack = queue.splice(0, 10)
		const success = await UserFlux.sendRequest(eventType, { events: eventsToTrack })
		if (success) {
			UserFlux.saveEventsToStorage(`uf-track`, queue)
		} else {
			// If the request fails, add the events back to the queue
			queue.push(...eventsToTrack)
			UserFlux.saveEventsToStorage(`uf-track`, queue)
		}

		// If the queue is not empty, check it again
		if (queue.length > 0) {
			await UserFlux.checkQueue(queue, eventType, true)
		}
	}

	static async sendRequest(endpoint, data, locationEnrich = UserFlux.ufLocationEnrichmentEnabled) {
		if (!UserFlux.isApiKeyProvided()) {
			console.info("API key not provided. Cannot send request.")
			return false
		}

		try {
			await fetch(`https://integration-api.userflux.co/${endpoint}?locationEnrichment=${locationEnrich}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${UserFlux.ufApiKey}`,
				},
				body: JSON.stringify(data),
				keepalive: true,
			})

			return true
		} catch (error) {
			console.info("UF Error: ", error)
			return false
		}
	}

	static getPageProperties() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return {}
			}

			return UserFlux.removeNullProperties({
				host: window.location.host,
				href: window.location.href,
				path: window.location.pathname,
				pageTitle: document.title,
			})
		} catch (e) {
			console.info("Error on getPageProperties:", error)
			return {}
		}
	}

	static getDeviceProperties() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			const userAgent = window.navigator.userAgent
			let browser, browserVersion, deviceType, os

			// Determine Browser and Browser Version
			if (userAgent.indexOf("Chrome") > -1) {
				browser = "Chrome"
				const match = userAgent.match(/Chrome\/(\d+)/)
				browserVersion = match ? match[1] : "Unknown"
			} else if (userAgent.indexOf("CriOS") > -1) {
				browser = "Chrome"
				const match = userAgent.match(/CriOS\/([\d.]+)/)
				browserVersion = match ? match[1] : "Unknown"
			} else if (userAgent.indexOf("Safari") > -1) {
				browser = "Safari"
				const match = userAgent.match(/Version\/([\d.]+)/)
				browserVersion = match ? match[1] : "Unknown"
			} else if (userAgent.indexOf("Firefox") > -1) {
				browser = "Firefox"
				const match = userAgent.match(/Firefox\/([\d.]+)/)
				browserVersion = match ? match[1] : "Unknown"
			} else if (userAgent.indexOf("MSIE") > -1 || userAgent.indexOf("Trident") > -1) {
				browser = "Internet Explorer"
				const match = userAgent.match(/(?:MSIE |rv:)(\d+)/)
				browserVersion = match ? match[1] : "Unknown"
			} else {
				browser = "Unknown"
				browserVersion = "Unknown"
			}

			// Determine Device Type
			if (/Mobi|Android/i.test(userAgent)) {
				deviceType = "Mobile"
			} else {
				deviceType = "Desktop"
			}

			// Determine OS
			if (/iPhone|iPad|iPod/i.test(userAgent)) {
				os = "iOS"
			} else if (userAgent.indexOf("Mac OS X") > -1) {
				os = "Mac OS X"
			} else if (userAgent.indexOf("Windows NT") > -1) {
				os = "Windows"
			} else if (userAgent.indexOf("Android") > -1) {
				os = "Android"
			} else if (userAgent.indexOf("Linux") > -1) {
				os = "Linux"
			} else {
				os = "Unknown"
			}

			// Determine Browser Language Preference
			const browserLanguage =
				navigator.language || navigator.userLanguage || navigator.browserLanguage || "Unknown"

			return UserFlux.removeNullProperties({
				userAgent: userAgent,
				browser: browser,
				browserVersion: browserVersion,
				deviceType: deviceType,
				os: os,
				screenWidth: window.screen.width,
				screenHeight: window.screen.height,
				browserWidth: window.innerWidth,
				browserHeight: window.innerHeight,
				browserLanguage: browserLanguage,
			})
		} catch (error) {
			console.info("Error:", error)
			return null
		}
	}

	static getCustomQueryParamProperties() {
		try {
			// Check if there are any custom query parameters to collect
			if (UserFlux.ufCustomQueryParamsToCollect.length == 0) return null

			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			// Pickup any custom query parameters from the href, default to null if it doesn't exist
			let locationHref = window.location.href
			const urlSearchParams = new URLSearchParams(new URL(locationHref).search)

			let customQueryParams = {}
			UserFlux.ufCustomQueryParamsToCollect.forEach((param) => {
				customQueryParams[param] = urlSearchParams.get(param) || null
			})

			// Remove any null properties from the object before returning
			return UserFlux.removeNullProperties(customQueryParams)
		} catch (error) {
			console.info("Error for getCustomQueryParamProperties(): ", error)
			return null
		}
	}

	static getUTMProperties() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			let locationHref = window.location.href

			// Extract query parameters
			const urlSearchParams = new URLSearchParams(new URL(locationHref).search)
			let queryParams = {
				utmSource: urlSearchParams.get("utm_source") || null,
				utmMedium: urlSearchParams.get("utm_medium") || null,
				utmCampaign: urlSearchParams.get("utm_campaign") || null,
				utmTerm: urlSearchParams.get("utm_term") || null,
				utmContent: urlSearchParams.get("utm_content") || null,
				utmId: urlSearchParams.get("utm_id") || null,
				utmSourcePlatform: urlSearchParams.get("utm_source_platform") || null,
			}

			return UserFlux.removeNullProperties(queryParams)
		} catch (error) {
			console.info("Error for getUTMProperties(): ", error)
			return null
		}
	}

	static getExternalIdQueryParam() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			let locationHref = window.location.href
			const urlSearchParams = new URLSearchParams(new URL(locationHref).search)
			return urlSearchParams.get("ufeid") || null
		} catch (error) {
			console.info("Error for getExternalIdQueryParam(): ", error)
			return null
		}
	}

	static getPaidAdProperties() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			let locationHref = window.location.href

			// Extract query parameters
			const urlSearchParams = new URLSearchParams(new URL(locationHref).search)
			let queryParams = {
				gclid: urlSearchParams.get("gclid") || null,
				fbclid: urlSearchParams.get("fbclid") || null,
				msclkid: urlSearchParams.get("msclkid") || null,
			}

			return UserFlux.removeNullProperties(queryParams)
		} catch (error) {
			console.info("Error for getPaidAdProperties(): ", error)
			return null
		}
	}

	static getReferrerProperties() {
		try {
			// Check if running in a browser environment
			if (typeof window === "undefined") {
				return null
			}

			return UserFlux.removeNullProperties({
				referrerHref: document.referrer !== "" ? document.referrer : null,
				referrerHost: document.referrer ? new URL(document.referrer).hostname : null,
			})
		} catch (error) {
			console.info("Error getReferrerProperties(): ", error)
			return null
		}
	}

	// Utility function to set a cookie
	static setCookie(name, value, days) {
		try {
			let expires = ""

			if (days) {
				const date = new Date()
				date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
				expires = "; expires=" + date.toUTCString()
			}

			// Set SameSite setting
			const sameSite = `; SameSite=${UserFlux.ufCookieSameSiteSetting}`

			// Dynamically determine the base domain
			const hostMatchRegex = /^(?:https?:\/\/)?(?:[^\/]+\.)?([^.\/]+\.(?:co\.uk|com\.au|com|co|money|io|is)).*$/i
			const matches = document.location.hostname.match(hostMatchRegex)
			const domain = matches ? matches[1] : ""
			const cookieDomain = domain ? "; domain=." + domain : ""

			document.cookie = name + "=" + (value || "") + expires + sameSite + "; Secure" + cookieDomain + "; path=/"
		} catch (error) {
			console.info("Error:", error)
		}
	}

	// Utility function to get a cookie
	static getCookie(name) {
		try {
			const nameEQ = name + "="
			const ca = document.cookie.split(";")
			for (let i = 0; i < ca.length; i++) {
				let c = ca[i]
				while (c.charAt(0) == " ") c = c.substring(1, c.length)
				if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length)
			}
			return null
		} catch (error) {
			console.info("Error:", error)
			return null
		}
	}

	// Utility function to erase a cookie
	static eraseCookie(name) {
		try {
			// Dynamically determine the base domain
			const hostMatchRegex = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i
			const matches = document.location.hostname.match(hostMatchRegex)
			const domain = matches ? "; domain=." + matches[0] : ""

			document.cookie = name + "=; Max-Age=-99999999; path=/" + "; domain=." + domain
		} catch (error) {
			console.info("Error:", error)
		}
	}

	// Method to check if localStorage is accessible
	static isLocalStorageAccessible() {
		try {
			// Try to use localStorage
			localStorage.setItem("uf-ls-test", "test")
			localStorage.removeItem("uf-ls-test")
			return true
		} catch (e) {
			// Catch any errors, including security-related ones
			return false
		}
	}

	// Method to check if sessionStorage is accessible
	static isSessionStorageAccessible() {
		try {
			const storage = window.sessionStorage
			const testKey = "uf-ss-test"
			storage.setItem(testKey, "test")
			storage.removeItem(testKey)
			return true
		} catch (e) {
			// Catch any errors, including security-related ones
			return false
		}
	}

	// Method to check if a strings value is null or empty
	// Handles edges cases where values retrieve from storage come back as string values instead of null
	static isStringNullOrBlank(value) {
		if (typeof value !== "string") return true
		return !value || value == null || value == undefined || value == "" || value == "null" || value == "undefined"
	}

	// Method to remove null properties from an object
	// Used for cleaning up the properties object of a event before tracking
	static removeNullProperties(object) {
		return Object.fromEntries(Object.entries(object).filter(([key, value]) => value !== null))
	}

	static isBotUserAgent(userAgent) {
		// Convert to lowercase for case-insensitive matching
		const lowerUA = userAgent.toLowerCase()

		// Check for empty or missing user agent, if so, assume it's not a bot
		if (!userAgent || userAgent.trim() === "") {
			return false
		}

		// List of common bot keywords
		const botKeywords = [
			"bot",
			"crawler",
			"spider",
			"scraper",
			"indexer",
			"archiver",
			"slurp",
			"googlebot",
			"bingbot",
			"yandexbot",
			"duckduckbot",
			"baiduspider",
			"twitterbot",
			"facebookexternalhit",
			"linkedinbot",
			"msnbot",
			"slackbot",
			"telegrambot",
			"applebot",
			"pingdom",
			"ia_archiver",
			"semrushbot",
			"ahrefsbot",
			"monotybot",
			"amazon-qbusiness",
			"google-safety",
			"amazon-kendra",
		]

		// Check for bot keywords
		for (const keyword of botKeywords) {
			if (lowerUA.includes(keyword)) {
				return true
			}
		}

		// Check for common bot patterns
		if (
			/(?:^|\W)spider(?:$|\W)/i.test(userAgent) ||
			/(?:^|\W)crawl(?:er|ing)(?:$|\W)/i.test(userAgent) ||
			/(?:^|\W)bot(?:$|\W)/i.test(userAgent) ||
			/\+https?:\/\//i.test(userAgent)
		) {
			return true
		}

		// If none of the above conditions are met, it's likely not a bot
		return false
	}
}

module.exports = UserFlux
