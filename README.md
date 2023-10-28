# @userflux/browser-analytics-js
UserFlux's Browser JavaScript SDK - send your frontend analytics data to the UserFlux platform.

# Getting Started
1. Install the package
```
npm i @userflux/browser-analytics-js
```

2. Import the package and initialise the SDK
```
import UserFlux from '@userflux/browser-analytics-js'

UserFlux.initialize('<YOUR_WRITE_KEY>', { autoCapturePageViews: true })
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
