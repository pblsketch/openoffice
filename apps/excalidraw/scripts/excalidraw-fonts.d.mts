import type { Plugin } from 'vite'

export function packageFontsDir(): string
export function copyExcalidrawFonts(publicDir: string): void
export function excalidrawFonts(publicDir: string): Plugin
export function dropCdnFallback(code: string): string | null
