import {createHash} from 'node:crypto'
// Shared by the server and vite.config.ts.
export const scriptHash=source=>`'sha256-${createHash('sha256').update(source.replace(/\r\n?/g,'\n')).digest('base64')}'`
export const inlineScripts=html=>[...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(Boolean)
