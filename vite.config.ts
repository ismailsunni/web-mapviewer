import { fileURLToPath, URL } from 'url'
import { gitDescribeSync } from 'git-describe'
import { defineConfig, normalizePath } from 'vite'
import vue from '@vitejs/plugin-vue'
import generateBuildInfo from './vite-plugins/vite-plugin-generate-build-info'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { dirname, resolve } from 'path'

// We take the version from APP_VERSION but if not set, then take
// it from git describe command
let appVersion = process.env.APP_VERSION
if (!appVersion) {
    appVersion = 'v' + gitDescribeSync().semverString
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const cesiumSource = `${__dirname}/node_modules/cesium/Source`
const cesiumWorkers = '../Build/Cesium/Workers'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
    return {
        base: './',
        build: {
            emptyOutDir: true,
            assetsDir: `${appVersion}/assets`,
            outDir: `./dist/${mode}`,
        },
        plugins: [
            vue(),
            generateBuildInfo(appVersion),
            viteStaticCopy({
                targets: [
                    {
                        src: normalizePath(`${cesiumSource}/${cesiumWorkers}`),
                        dest: `./`,
                    },
                    {
                        src: normalizePath(`${cesiumSource}/Assets/`),
                        dest: `./`,
                    },
                    {
                        src: normalizePath(`${cesiumSource}/Widgets/`),
                        dest: `./`,
                    },
                    {
                        src: normalizePath(`${cesiumSource}/ThirdParty/`),
                        dest: `./`,
                    },
                ],
            }),
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
                tests: fileURLToPath(new URL('./tests', import.meta.url)),
                cesium: normalizePath(resolve(__dirname, 'node_modules/cesium')),
            },
        },
        define: {
            __APP_VERSION__: JSON.stringify(appVersion),
            VITE_ENVIRONMENT: JSON.stringify(mode),
        },
        test: {
            include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
            reporter: ['default', 'junit'],
            outputFile: 'tests/results/unit/unit-test-report.xml',
            silent: true,
        },
    }
})
