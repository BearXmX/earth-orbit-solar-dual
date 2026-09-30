import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'

const editionDirectory = (edition: string | undefined, angleFormat: string | undefined) => {
  const directory = edition === 'standard'
    ? '地球自转与公转-标准版'
    : edition === 'city'
      ? '地球自转与公转-进阶城市版'
      : '地球自转与公转-进阶日晷版'
  return angleFormat === 'decimal' ? `${directory}-23.5度版` : directory
}

const projectDirectory = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory)
  return {
    envDir: projectDirectory,
    plugins: [
      vue(),
      viteSingleFile(),
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
      outDir: editionDirectory(env.VITE_APP_EDITION, env.VITE_ANGLE_FORMAT),
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
  }
})
