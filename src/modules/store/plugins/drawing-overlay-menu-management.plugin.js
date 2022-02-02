import { UIModes } from '@/modules/store/modules/ui.store'

/**
 * Plugin managing the UI fullscreen mode when drawing, toggling the menu tray / map overlay when needed
 *
 * @param {Vuex.Store} store
 */
const drawingOverlayAndMenuManagementPlugin = (store) => {
    store.subscribe((mutation, state) => {
        if (mutation.type === 'setShowDrawingOverlay') {
            if (state.ui.mode === UIModes.MENU_OPENED_THROUGH_BUTTON) {
                // store.dispatch('toggleMenuTray')
            }
        }
    })
}

export default drawingOverlayAndMenuManagementPlugin
