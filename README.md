# @userflux/browser-js
UserFlux's Browser JavaScript SDK - send your frontend analytics data to the UserFlux platform.

# Getting Started

## 1. Install the package

```bash
npm i @userflux/browser-js
```

## 2. Initialise the SDK

```javascript
import UserFlux from '@userflux/browser-js'
UserFlux.initialize('<YOUR_WRITE_KEY>', { 
    autoCapture: ['page_views', 'page_leaves', 'clicks'], 
    allowCookies: true, 
    autoEnrich: true, 
    defaultTrackingProperties: { ... } 
})
```

The `initialize` method takes two arguments:
- `writeKey` - Your UserFlux write key. You can find this in the UserFlux dashboard under `Management > Account Settings > Developers > Write Key`
- `options` - An object containing the following optional properties:
    - `autoCapture` - An array of strings used to define which events to automatically capture. Defaults to none. The following events are available:
        - `page_views` - Capture page views
        - `page_leaves` - Capture page leaves
        - `clicks` - Capture clicks
        - `all` - Capture all of the above events
    - `allowCookies` - A boolean indicating whether or not to allow cookies. Defaults to `true`
    - `autoEnrich` - A boolean indicating whether or not to automatically enrich events with additional information such as location and device properties. Defaults to `true`
    - `defaultTrackingProperties` - An object containing any default properties to be sent with every event. Defaults to an empty object

## 3. Tracking events

```javascript
UserFlux.track({
    event: 'event_name',
    properties: { ... },
    userId: '<USER_ID>',
    enrichDeviceData: true,
    enrichLocationData: true
})
```

The `track` method takes a single argument:
- `parameters` - An object containing the following properties:
    - `event` - (required) A string representing the name of the event
    - `properties` - (optional) An object containing any properties to be sent with the event. Defaults to an empty object`defaultTrackingProperties` option will be merged with these properties
    - `userId` - (optional) A string representing the user ID of the user you're identifying with attributes
    - `enrichDeviceData` - (optional) A boolean indicating whether or not to enrich the event with device data. Defaults to the value of `autoEnrich` in the global options
    - `enrichLocationData` - (optional) A boolean indicating whether or not to enrich the event with location data. Defaults to the value of `autoEnrich` in the global options

## 4. Identifying users

```javascript
UserFlux.identify({
    properties: { ... },
    userId: '<USER_ID>',
    enrichDeviceData: true,
    enrichLocationData: true
})
```

The `identify` method takes a single argument:
- `parameters` - An object containing the following properties:
    - `properties` - (required) An object containing any attributes to be associated with the users profile
    - `userId` - (optional) A string representing the user ID of the user you're identifying with attributes
    - `enrichDeviceData` - (optional) A boolean indicating whether or not to enrich the event with device data. Defaults to the value of `autoEnrich` in the global options
    - `enrichLocationData` - (optional) A boolean indicating whether or not to enrich the event with location data. Defaults to the value of `autoEnrich` in the global options

# Other Methods Available

## updateDefaultTrackingProperties
```javascript
UserFlux.updateDefaultTrackingProperties({ ... })
```

If at any time you wish to update the default tracking properties, you can do so by calling the `updateDefaultTrackingProperties` method.

The `updateDefaultTrackingProperties` method takes one argument:
- `defaultTrackingProperties` - An object containing any default properties to be sent with every event.

## reset

```javascript
UserFlux.reset()
```

If at any time you wish to reset the SDK, you can do so by calling the `reset` method. This will clear any cookies / local storage and reset the SDK to its initial state.

## trackEnrichDisabled

```javascript
UserFlux.trackEnrichDisabled('event_name', { ... }, '<USER_ID>')
```

If you have enabled `autoEnrich` in the global options, you can disable this for individual events by calling the `trackEnrichDisabled` method.

## identifyEnrichDisabled

```javascript
UserFlux.identifyEnrichDisabled({ ... }, '<USER_ID>')
```

If you have enabled `autoEnrich` in the global options, you can disable this for individual identify calls by calling the `identifyEnrichDisabled` method.

## trackPageView

```javascript
UserFlux.trackPageView()
```

If you have disabled `autoCapture` in the global options, you can manually capture page views by calling the `trackPageView` method.

## getUserId

```javascript
UserFlux.getUserId()
```

If you have provided a `userId` in the `identify` or `track` methods, you can retrieve this by calling the `getUserId` method.

## getAnonymousId

```javascript
UserFlux.getAnonymousId()
```

You can retrieve the anonymous id by calling the `getAnonymousId` method. This is the id that will be used if no `userId` is provided in the `identify` or `track` methods.

# Alternative Installation
If you do not want to use the NPM package manger, simply drop the following into your HTML
```html
<head>
    ...
    <script type="module" async>
    import UserFlux from 'https://cdn.skypack.dev/@userflux/browser-js@<version>'
    UserFlux.initialize('<YOUR_WRITE_KEY>', { 
        autoCapture: ['all'], 
        allowCookies: true, 
        autoEnrich: true, 
        defaultTrackingProperties: { ... } 
    })
    </script>
</head>
```