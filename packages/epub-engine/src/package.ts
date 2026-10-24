/**
 * The three OCF/OPF files that decide whether a book opens (spec §3): the
 * container (where the package document is), the encryption list (DRM or
 * only obfuscated fonts) and the package document itself.
 */
import { isFontObfuscationAlgorithm } from './fonts'
import { resolveHref } from './paths'
import type {
  EpubIdentifier,
  EpubLayout,
  EpubManifestItem,
  EpubMetadata,
  EpubObfuscatedFont,
  EpubSpine,
} from './types'
import {
  attr,
  attrByName,
  childElements,
  collapseWhitespace,
  textContent,
  tokens,
  walk,
  type XmlElement,
} from './xml'

export const CONTAINER_PATH = 'META-INF/container.xml'
export const RIGHTS_PATH = 'META-INF/rights.xml'
export const ENCRYPTION_PATH = 'META-INF/encryption.xml'

const OPF_MEDIA_TYPE = 'application/oebps-package+xml'
const DC_NS = 'http://purl.org/dc/elements/1.1/'
const OPF_NS = 'http://www.idpf.org/2007/opf'

/** A problem that makes the file "not an EPUB, or damaged". */
export class NotEpubError extends Error {}

const childrenNamed = (element: XmlElement, local: string): XmlElement[] =>
  childElements(element).filter((el) => el.local === local)

/**
 * The package document's zip path from `container.xml`: the first rootfile of
 * the OPF media type, else the first rootfile at all. Throws `NotEpubError`
 * when there is none.
 */
export function packagePathFromContainer(container: XmlElement): string {
  const rootfiles = [...walk(container)].filter(
    (el) => el.local === 'rootfile' && attr(el, 'full-path'),
  )
  const chosen =
    rootfiles.find((el) => attr(el, 'media-type')?.trim() === OPF_MEDIA_TYPE) ?? rootfiles[0]
  const resolved = chosen ? resolveHref('', attr(chosen, 'full-path')!) : null
  if (!resolved || resolved.path === '') {
    throw new NotEpubError(`${CONTAINER_PATH} names no package document`)
  }
  return resolved.path
}

export interface EncryptionScan {
  /** an algorithm other than font obfuscation, or encrypted data without a method */
  drm: string | null
  /** obfuscated font paths as resolved, not yet checked against the archive */
  fonts: EpubObfuscatedFont[]
}

/**
 * Reads `encryption.xml`. Every `EncryptionMethod` (on encrypted data or on an
 * encrypted key) must name one of the two font obfuscation algorithms, and
 * every `EncryptedData` must have one; anything else is DRM.
 */
export function scanEncryption(encryption: XmlElement): EncryptionScan {
  const fonts: EpubObfuscatedFont[] = []
  for (const el of walk(encryption)) {
    if (el.local === 'EncryptionMethod') {
      const algorithm = attr(el, 'Algorithm')?.trim() ?? ''
      if (!isFontObfuscationAlgorithm(algorithm)) {
        return { drm: `encryption algorithm ${algorithm || '(none)'}`, fonts: [] }
      }
    }
    if (el.local !== 'EncryptedData') continue
    const method = childrenNamed(el, 'EncryptionMethod')[0]
    const algorithm = method ? attr(method, 'Algorithm')?.trim() : undefined
    if (!algorithm || !isFontObfuscationAlgorithm(algorithm)) {
      return { drm: `encrypted data with algorithm ${algorithm ?? '(none)'}`, fonts: [] }
    }
    for (const ref of walk(el)) {
      if (ref.local !== 'CipherReference') continue
      const uri = attr(ref, 'URI')
      // Relative to the container root; a `../` written against META-INF stops there.
      const resolved = uri === undefined ? null : resolveHref('', uri)
      if (resolved && resolved.path !== '') fonts.push({ path: resolved.path, algorithm })
    }
  }
  return { drm: null, fonts }
}

/** The package document, with manifest hrefs resolved but the spine not yet checked. */
export interface ParsedPackage {
  version: '2' | '3'
  packageVersion: string
  metadata: EpubMetadata
  manifest: EpubManifestItem[]
  spineRefs: { idref: string; linear: boolean; properties: string[]; layout: EpubLayout | null }[]
  pageProgressionDirection: EpubSpine['pageProgressionDirection']
  tocId: string | null
}

const isDc = (el: XmlElement, local: string): boolean =>
  el.local.toLowerCase() === local && (el.uri === DC_NS || el.name.toLowerCase().startsWith('dc:'))

const layoutValue = (value: string | undefined): EpubLayout | null =>
  value === 'pre-paginated' || value === 'reflowable' ? value : null

function itemrefLayout(properties: string[]): EpubLayout | null {
  for (const p of properties) {
    if (p === 'rendition:layout-pre-paginated') return 'pre-paginated'
    if (p === 'rendition:layout-reflowable') return 'reflowable'
  }
  return null
}

function readMetadata(metadata: XmlElement | undefined): EpubMetadata {
  const titles: { id: string | null; text: string }[] = []
  const creators: string[] = []
  const languages: string[] = []
  const identifiers: EpubIdentifier[] = []
  const metas: XmlElement[] = []
  for (const el of metadata ? walk(metadata) : []) {
    const value = (): string => textContent(el).trim()
    if (isDc(el, 'title')) titles.push({ id: attr(el, 'id') ?? null, text: value() })
    else if (isDc(el, 'creator')) creators.push(value())
    else if (isDc(el, 'language')) languages.push(value())
    else if (isDc(el, 'identifier')) {
      identifiers.push({
        id: attr(el, 'id') ?? null,
        value: value(),
        scheme: attr(el, 'scheme', OPF_NS) ?? attrByName(el, 'opf:scheme') ?? null,
      })
    } else if (el.local === 'meta') metas.push(el)
  }

  const mainTitleIds = new Set(
    metas
      .filter((m) => attr(m, 'property') === 'title-type' && textContent(m).trim() === 'main')
      .map((m) => attr(m, 'refines')?.trim().replace(/^#/, '')),
  )
  const main = titles.find((t) => t.id !== null && mainTitleIds.has(t.id)) ?? titles[0]

  const globalLayout = metas.find(
    (m) => attr(m, 'property') === 'rendition:layout' && attr(m, 'refines') === undefined,
  )
  const writingMode = metas.find((m) => attr(m, 'name') === 'primary-writing-mode')

  return {
    title: main?.text ?? '',
    titles: titles.map((t) => t.text),
    creators,
    languages,
    identifiers,
    uniqueIdentifier: null,
    layout:
      layoutValue(globalLayout ? collapseWhitespace(textContent(globalLayout)) : undefined) ??
      'reflowable',
    primaryWritingMode: writingMode ? (attr(writingMode, 'content')?.trim() ?? null) : null,
  }
}

/**
 * Reads the package document. `findEntry` maps a resolved path to the
 * archive's own entry name (exact, else case-insensitive), or null.
 * Throws `NotEpubError` when the root is not a package or the manifest or
 * spine is missing.
 */
export function parsePackage(
  root: XmlElement,
  opfPath: string,
  findEntry: (path: string) => string | null,
): ParsedPackage {
  if (root.local !== 'package') throw new NotEpubError(`${opfPath} is not a package document`)
  const manifestEl = childrenNamed(root, 'manifest')[0]
  const spineEl = childrenNamed(root, 'spine')[0]
  if (!manifestEl) throw new NotEpubError(`${opfPath} has no manifest`)
  if (!spineEl) throw new NotEpubError(`${opfPath} has no spine`)

  const packageVersion = attr(root, 'version')?.trim() ?? ''
  const major = parseInt(packageVersion, 10)
  const metadata = readMetadata(childrenNamed(root, 'metadata')[0])
  const uidRef = attr(root, 'unique-identifier')?.trim()
  const unique = uidRef ? metadata.identifiers.find((i) => i.id === uidRef) : undefined
  metadata.uniqueIdentifier = unique?.value ?? null

  const manifest: EpubManifestItem[] = []
  for (const item of childrenNamed(manifestEl, 'item')) {
    const href = attr(item, 'href')
    if (href === undefined) continue
    const resolved = resolveHref(opfPath, href)
    manifest.push({
      id: attr(item, 'id') ?? '',
      href,
      path: resolved ? (findEntry(resolved.path) ?? resolved.path) : null,
      mediaType: attr(item, 'media-type')?.trim() ?? '',
      properties: tokens(attr(item, 'properties')),
    })
  }

  const spineRefs = childrenNamed(spineEl, 'itemref').map((ref) => {
    const properties = tokens(attr(ref, 'properties'))
    return {
      idref: attr(ref, 'idref')?.trim() ?? '',
      linear: attr(ref, 'linear')?.trim() !== 'no',
      properties,
      layout: itemrefLayout(properties),
    }
  })
  const direction = attr(spineEl, 'page-progression-direction')?.trim()

  return {
    version: major >= 3 ? '3' : '2',
    packageVersion,
    metadata,
    manifest,
    spineRefs,
    pageProgressionDirection:
      direction === 'ltr' || direction === 'rtl' || direction === 'default' ? direction : null,
    tocId: attr(spineEl, 'toc')?.trim() || null,
  }
}
