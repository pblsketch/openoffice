/**
 * The runtimes the app may download for the person's own MCP servers, pinned
 * per app release. A version and its SHA-256 change only together, in code.
 *
 * Sources (read on 2026-11-01, not guessed):
 * - Node.js v26.13.0 (LTS "Lithium"): https://nodejs.org/dist/index.json and
 *   https://nodejs.org/dist/v26.13.0/SHASUMS256.txt; sizes from the
 *   Content-Length of each archive.
 * - uv 0.13.6 (latest stable): https://github.com/astral-sh/uv/releases/tag/0.13.6,
 *   each asset's `<asset>.sha256` file, matching the release API's `digest`
 *   and `size`.
 * - CPython 3.13.18: listed for every platform below in uv 0.13.6's
 *   https://raw.githubusercontent.com/astral-sh/uv/0.13.6/crates/uv-python-managed/download-metadata.json
 *   (build 20261026). Only the version is pinned: uv checks the hash of its
 *   own Python downloads. Sizes are those archives' Content-Length.
 */

/** The OS and chip pairs the app pins a download for */
export type McpRuntimePlatformKey = 'win32-x64' | 'darwin-arm64' | 'darwin-x64' | 'linux-x64'

export const MCP_RUNTIME_PLATFORM_KEYS: readonly McpRuntimePlatformKey[] = [
  'win32-x64',
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
]

export interface PinnedArchive {
  url: string
  /** lowercase hex SHA-256 of the archive */
  sha256: string
  /** exact archive size in bytes; a longer download is cut off and refused */
  bytes: number
  format: 'zip' | 'tar.gz'
  /** the archive's top folder, removed when unpacking ('' when the files sit at the top) */
  root: string
}

export interface PinnedRuntime {
  version: string
  archives: Record<McpRuntimePlatformKey, PinnedArchive>
}

export interface PinnedPython {
  /** the CPython version `uv python install` is asked for */
  version: string
  /** approximate download size per platform, for the question */
  bytes: Record<McpRuntimePlatformKey, number>
}

export interface McpRuntimePins {
  node: PinnedRuntime
  uv: PinnedRuntime
  python: PinnedPython
}

const NODE_VERSION = '26.13.0'
const NODE_DIST = `https://nodejs.org/dist/v${NODE_VERSION}`
const UV_VERSION = '0.13.6'
const UV_DIST = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`

export const MCP_RUNTIME_PINS: McpRuntimePins = {
  node: {
    version: NODE_VERSION,
    archives: {
      'win32-x64': {
        url: `${NODE_DIST}/node-v${NODE_VERSION}-win-x64.zip`,
        sha256: 'dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a',
        bytes: 41_157_375,
        format: 'zip',
        root: `node-v${NODE_VERSION}-win-x64`,
      },
      'darwin-arm64': {
        url: `${NODE_DIST}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
        sha256: 'd38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6',
        bytes: 58_334_661,
        format: 'tar.gz',
        root: `node-v${NODE_VERSION}-darwin-arm64`,
      },
      'darwin-x64': {
        url: `${NODE_DIST}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
        sha256: '525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e',
        bytes: 59_802_926,
        format: 'tar.gz',
        root: `node-v${NODE_VERSION}-darwin-x64`,
      },
      'linux-x64': {
        url: `${NODE_DIST}/node-v${NODE_VERSION}-linux-x64.tar.gz`,
        sha256: '5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455',
        bytes: 62_893_692,
        format: 'tar.gz',
        root: `node-v${NODE_VERSION}-linux-x64`,
      },
    },
  },
  uv: {
    version: UV_VERSION,
    archives: {
      'win32-x64': {
        url: `${UV_DIST}/uv-x86_64-pc-windows-msvc.zip`,
        sha256: 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f',
        bytes: 15_239_500,
        format: 'zip',
        root: '',
      },
      'darwin-arm64': {
        url: `${UV_DIST}/uv-aarch64-apple-darwin.tar.gz`,
        sha256: '60fbd5c8a1ed681845eea28d9d622fcde03c51e91a43465b64a1e17db1ed3472',
        bytes: 14_235_670,
        format: 'tar.gz',
        root: 'uv-aarch64-apple-darwin',
      },
      'darwin-x64': {
        url: `${UV_DIST}/uv-x86_64-apple-darwin.tar.gz`,
        sha256: '63ba17fdda55ad1a230d4b37fc6017ffa10c23688c83818bd3bfdf914c652a02',
        bytes: 17_004_934,
        format: 'tar.gz',
        root: 'uv-x86_64-apple-darwin',
      },
      'linux-x64': {
        url: `${UV_DIST}/uv-x86_64-unknown-linux-gnu.tar.gz`,
        sha256: 'f29c3e94ffabd7e6f3ba521dba169a9b7ec12100bf3257087f0f24f6123f3645',
        bytes: 16_799_024,
        format: 'tar.gz',
        root: 'uv-x86_64-unknown-linux-gnu',
      },
    },
  },
  python: {
    version: '3.13.18',
    bytes: {
      'win32-x64': 22_023_022,
      'darwin-arm64': 25_265_774,
      'darwin-x64': 25_055_263,
      'linux-x64': 35_395_906,
    },
  },
}

/** The pinned key for this OS and chip, or null when the app pins nothing for it */
export function mcpRuntimePlatformKey(
  platform: NodeJS.Platform,
  arch: string,
): McpRuntimePlatformKey | null {
  const key = `${platform}-${arch}`
  return (MCP_RUNTIME_PLATFORM_KEYS as readonly string[]).includes(key)
    ? (key as McpRuntimePlatformKey)
    : null
}
