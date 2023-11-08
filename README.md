# @userflux/browser-js
UserFlux's Browser JavaScript SDK - send your frontend analytics data to the UserFlux platform.

# Getting Started
## 1. Install the package
```
npm i @userflux/browser-js
```
###
## 2. Import the package and initialise the SDK
```
import UserFlux from '@userflux/browser-js'
UserFlux.initialize('<YOUR_WRITE_KEY>', { autoCapture: ['page_views', 'page_leaves', 'clicks'], allowCookies: true, autoEnrich: true, defaultTrackingProperties: { releaseVersion: '2.0.14' } })
```

The `initialize` method takes two arguments:
- `writeKey` - Your UserFlux write key. You can find this in the UserFlux dashboard under `Management > Account Settings > Developers > Write Key`
- `options` - An object containing the following optional properties:
    - `autoCapture` - An array of events to automatically capture. The following events are available:
        - `page_views` - Capture page views
        - `page_leaves` - Capture page leaves
        - `clicks` - Capture clicks
        - `all` - Capture all of the above events
    - `allowCookies` - A boolean indicating whether or not to allow cookies. Defaults to `true`
    - `autoEnrich` - A boolean indicating whether or not to automatically enrich events with additional information. Defaults to `true`
    - `defaultTrackingProperties` - An object containing default properties to be sent with every event. Defaults to an empty object

###
## 3. Tracking events
Track an event associated with a profile by the users unique identifier
```
UserFlux.track('signup', { referringDomain: 'https://google.com' }, '<USER_ID>')
```
Track an event without providing a user id. If no user id has been provided previously, the event will be associated with the anonymous profile
```
UserFlux.track('signup', { referringDomain: 'https://google.com' })
```
###
## 4. Identifying users
Set new properties for a profile by the users unique identifier
```
UserFlux.identify({ location: 'Sydney' }, '<USER_ID>')
```
Set new properties without providing a user id. If no user id has been provided previously, the properties will be associated with the anonymous profile
```
UserFlux.identify({ location: 'Sydney' })
```
###
# Alternative Installation Options
If you do not want to use the NPM package manger, simply drop the following into your HTML
```
<head>
    ...
    <script type="module" async>
    import UserFlux from 'https://cdn.skypack.dev/@userflux/browser-js@1.0.59'
    UserFlux.initialize('<YOUR_WRITE_KEY>', { autoCapture: ['page_views', 'page_leaves', 'clicks'], allowCookies: true, autoEnrich: true, defaultTrackingProperties: { releaseVersion: '2.0.14' } })
    </script>
</head>
```