import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

let currentMode = 'standard'

const modeArgIndex = process.argv.findIndex(item => item === '--mode')

if (modeArgIndex !== -1 && process.argv[modeArgIndex + 1]) {
  currentMode = process.argv[modeArgIndex + 1]
}

const isStandard = currentMode === 'standard'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    {
      name: 'fix-html-for-file-protocol',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html) {
        // 1. 移除type="module"和crossorigin
        html = html.replace(/type="module"/g, '')
        html = html.replace(/crossorigin/g, '')

        // 2. 安全匹配script标签（带空值判断）
        const scriptMatch = html.match(/<script\s+src="[^"]+\.js"><\/script>/i)
        if (scriptMatch && scriptMatch[0]) {
          const scriptTag = scriptMatch[0]
          // 移除原script标签
          html = html.replace(scriptTag, '')
          // 把script标签加到body末尾
          html = html.replace('</body>', `${scriptTag}</body>`)
        }

        return html
      },
    },
  ],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: `地球自转与公转-${isStandard ? '标准版' : '进阶版'}`,
    assetsDir: 'assets',
    copyPublicDir: true, // 开启public目录复制（如果textures在public下）
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'SundialApp',
        entryFileNames: 'assets/index.js',
        assetFileNames: 'assets/[name].[ext]',
        globals: { vue: 'Vue' },
      },
    },
    modulePreload: { polyfill: false },
    cssCodeSplit: false, // 可选：内联CSS，减少文件依赖
  },
})
