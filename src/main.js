import Vue from 'vue'

// importing styling CSS libraries
import 'bootstrap'
import 'animate.css'

import App from './App.vue'
import store from '@/modules/store'
import i18n from '@/modules/i18n'
import './registerServiceWorker'

import { VueSvgIcon } from '@yzfe/vue-svgicon'
import '@yzfe/svgicon/lib/svgicon.css'
import router from './router'
import setupProj4 from '@/utils/setupProj4'
import { DEBUG, IS_TESTING_WITH_CYPRESS } from '@/config'

setupProj4()

Vue.config.productionTip = DEBUG

// setting up font awesome vue component
require('./setup-fontawesome')
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
Vue.component('font-awesome-icon', FontAwesomeIcon)

// Adding component used to load the Swiss flag SVG as a Vue component
Vue.component('icon', VueSvgIcon)

new Vue({
    store,
    i18n,
    router,
    render: (h) => h(App),
}).$mount('#app')

// if we are testing with Cypress, we expose the store
if (IS_TESTING_WITH_CYPRESS) {
    window.store = store
}
