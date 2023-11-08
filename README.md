# @userflux/browser-js
UserFlux's Browser JavaScript SDK - send your frontend analytics data to the UserFlux platform.

# Getting Started
1. Install the package
```
npm i @userflux/browser-js
```

2. Import the package and initialise the SDK
```
import UserFlux from '@userflux/browser-js'
UserFlux.initialize('<YOUR_WRITE_KEY>', { autoCapture: ['page_views', 'page_leaves', 'clicks'], allowCookies: true, autoEnrich: true, defaultTrackingProperties: {} })
```

Alternatively install without using a package manager
```
<head>
    ...
    <script type="module">
    import UserFlux from 'https://cdn.skypack.dev/@userflux/browser-js@1.0.59'
    UserFlux.initialize('<YOUR_WRITE_KEY>', { autoCapture: ['page_views', 'page_leaves', 'clicks'], allowCookies: true, autoEnrich: true, defaultTrackingProperties: {} })
    </script>
</head>
```

3. Tracking events
```
UserFlux.track('signup', { referringDomain: 'https://google.com' }, '<USER_ID>')
```

```
UserFlux.track('signup', { referringDomain: 'https://google.com' })
```

4. Identifying users
```
UserFlux.identify({ location: 'Sydney' }, '<USER_ID>')
```

```
UserFlux.identify({ location: 'Sydney' })
```
