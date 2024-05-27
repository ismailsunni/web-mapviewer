import proj4 from 'proj4'

import { IS_TESTING_WITH_CYPRESS } from '@/config'
import i18n from '@/modules/i18n'
import { WGS84 } from '@/utils/coordinates/coordinateSystems'
import CustomCoordinateSystem from '@/utils/coordinates/CustomCoordinateSystem.class.js'
import { STANDARD_ZOOM_LEVEL_1_25000_MAP } from '@/utils/coordinates/SwissCoordinateSystem.class.js'
import log from '@/utils/logging'

const dispatcher = { dispatcher: 'geolocation-management.plugin' }

let geolocationWatcher = null
let firstTimeActivatingGeolocation = true

const readPosition = (position, projection) => {
    const { coords } = position
    return proj4(WGS84.epsg, projection.epsg, [coords.longitude, coords.latitude])
}

const handlePositionAndDispatchToStore = (position, store) => {
    log.debug(`Received position from geolocation`, position, store.state.geolocation)
    const positionProjected = readPosition(position, store.state.position.projection)
    store.dispatch('setGeolocationPosition', {
        position: positionProjected,
        ...dispatcher,
    })
    store.dispatch('setGeolocationAccuracy', {
        accuracy: position.coords.accuracy,
        ...dispatcher,
    })
    // if tracking is active, we center the view of the map on the position received
    if (store.state.geolocation.tracking) {
        store.dispatch('setCenter', {
            center: positionProjected,
            ...dispatcher,
        })
    }
}

/**
 * Handles Geolocation API errors
 *
 * @param {GeolocationPositionError} error
 * @param {Vuex.Store} store
 */
const handlePositionError = (error, store) => {
    log.error('Geolocation activation failed', error)
    switch (error.code) {
        case error.PERMISSION_DENIED:
            store.dispatch('setGeolocationDenied', {
                denied: true,
                ...dispatcher,
            })
            alert(i18n.global.t('geoloc_permission_denied'))
            break
        default:
            if (IS_TESTING_WITH_CYPRESS && error.code === error.POSITION_UNAVAILABLE) {
                // edge case for e2e testing, if we are testing with Cypress and we receive a POSITION_UNAVAILABLE
                // we don't raise an alert as it's "normal" in Electron to have this error raised (this API doesn't work
                // on Electron embedded in Cypress : no Geolocation hardware detected, etc...)
                // the position will be returned by a mocked up function by Cypress we can ignore this error
                // we do nothing...
            } else {
                alert(i18n.global.t('geoloc_unknown'))
            }
    }
}

const activeGeolocation = (store, state) => {
    if (store.state.geolocation.position[0] !== 0 && store.state.geolocation.position[1] !== 0) {
        // if we have a previous position use it first to be more reactive but set a
        // bad accuracy as we don't know how exact it is.
        store.dispatch('setCenter', {
            center: store.state.geolocation.position,
            ...dispatcher,
        })
        store.dispatch('setGeolocationAccuracy', {
            accuracy: 50 * 1000, // 50 km
            ...dispatcher,
        })
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            log.debug(
                `Geolocation API current position`,
                position,
                `firstTimeActivatingGeolocation=${firstTimeActivatingGeolocation}`
            )
            // if geoloc was previously denied, we clear the flag
            if (state.geolocation.denied) {
                store.dispatch('setGeolocationDenied', {
                    denied: false,
                    ...dispatcher,
                })
            }
            // register a watcher
            geolocationWatcher = navigator.geolocation.watchPosition(
                (position) => handlePositionAndDispatchToStore(position, store),
                (error) => handlePositionError(error, store)
            )

            // handle current position
            handlePositionAndDispatchToStore(position, store)

            // set zoom level
            let zoomLevel = STANDARD_ZOOM_LEVEL_1_25000_MAP
            if (state.position.projection instanceof CustomCoordinateSystem) {
                zoomLevel = state.position.projection.transformStandardZoomLevelToCustom(zoomLevel)
            }
            store.dispatch('setZoom', {
                zoom: zoomLevel,
                ...dispatcher,
            })
        },
        (error) => handlePositionError(error, store),
        {
            maximumAge: 5 * 60 * 1000, // 5 minutes
            timeout: 2 * 60 * 1000, // 2 minutes
        }
    )
}

/**
 * Plugin that handle the HTML5 Geolocation API interaction, and dispatch its output to the store
 * when geolocation is active.
 *
 * @param {Vuex.Store} store
 */
const geolocationManagementPlugin = (store) => {
    store.subscribe((mutation, state) => {
        // listening to the start/stop of geolocation
        if (mutation.type === 'setGeolocationActive') {
            if (state.geolocation.active) {
                activeGeolocation(store, state)
            } else if (geolocationWatcher) {
                log.debug(`Geolocation clear watcher`)
                navigator.geolocation.clearWatch(geolocationWatcher)
                geolocationWatcher = null
            }
        } else if (
            mutation.type === 'setCenter' &&
            mutation.payload?.dispatcher !== dispatcher.dispatcher
        ) {
            // if we moved the map we disabled the tracking (unless the tracking moved the map)
            store.dispatch('setGeolocationTracking', {
                tracking: false,
                ...dispatcher,
            })
        }
    })
}

export default geolocationManagementPlugin
