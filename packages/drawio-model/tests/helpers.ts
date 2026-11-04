import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import { parseDiagramXml, type DiagramFile } from '../src/index'
import { nodePageCodec } from '../src/node-codec'

export const codec = nodePageCodec

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
}

export function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A page model with the root cell, layer `1` and the given cells. */
export function model(cells = ''): string {
  return `<mxGraphModel dx="800" dy="600" grid="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
}

export function vertex(
  id: string,
  value: string,
  style: string,
  geometry = '0,0,120,60',
  parent = '1',
): string {
  const [x, y, width, height] = geometry.split(',')
  return `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`
}

export function edge(id: string, source: string, target: string, value = '', parent = '1'): string {
  return `<mxCell id="${id}" value="${value}" style="endArrow=classic;html=1;" edge="1" parent="${parent}" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`
}

export function mxfile(...pages: string[]): string {
  return `<mxfile host="test" modified="2026-11-03T00:00:00Z" agent="x">\n${pages.join('\n')}\n</mxfile>\n`
}

export function page(id: string, name: string, body: string): string {
  return `  <diagram id="${id}" name="${name}">${body}</diagram>`
}

export function open(xml: string): DiagramFile {
  const result = parseDiagramXml(xml, codec)
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`)
  return result.file
}

/** The `<diagram ...>...</diagram>` elements of an mxfile text, as written. */
export function diagramElements(xml: string): string[] {
  return xml.match(/<diagram\b[\s\S]*?<\/diagram>/g) ?? []
}

export function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) expect.fail(JSON.stringify(result))
  return result as Extract<T, { ok: true }>
}
