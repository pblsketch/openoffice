/**
 * Where the other people in a co-editing session are (decision 0073): their
 * selections over the canvas with their names, and a mark on the rail
 * thumbnail of the slide each one is on. Plain DOM beside the Konva stage, so
 * it never reaches an export, a thumbnail image or the saved file.
 */
import type { CSSProperties } from 'react'
import { collabColorVar } from '@genoffice/collab'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { PeerPresence } from './collab'
import './collab-layer.css'

const tint = (peer: PeerPresence) =>
  ({ ['--collab-c' as string]: collabColorVar(peer.color) }) as CSSProperties

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

/** over the stage, in the same canvas pixels as the slide's nodes */
export function CollabCanvasLayer({
  slide,
  peers,
  zoom,
}: {
  slide: RenderSlide
  peers: PeerPresence[]
  zoom: number
}) {
  const here = peers.filter((p) => p.value.slide === slide.partPath)
  if (!here.length) return null
  // labels keep their on-screen size at any zoom
  const label = { transform: `scale(${1 / (zoom || 1)})` }
  const idle = here.filter((p) => p.value.boxes.length === 0)
  return (
    <div className="collab-layer" aria-hidden="true">
      {here.flatMap((peer) =>
        peer.value.boxes.map((box, i) => (
          <div
            key={`${peer.clientId}:${i}`}
            className={`collab-box${peer.value.editing ? ' collab-box-editing' : ''}`}
            style={{
              ...tint(peer),
              left: box.x * slide.widthPx,
              top: box.y * slide.heightPx,
              width: box.w * slide.widthPx,
              height: box.h * slide.heightPx,
            }}
          >
            {i === 0 && (
              <span className="collab-box-label" style={label}>
                {peer.name}
              </span>
            )}
          </div>
        )),
      )}
      {idle.length > 0 && (
        <div className="collab-here" style={{ ...label, transformOrigin: 'top right' }}>
          {idle.map((peer) => (
            <span key={peer.clientId} className="collab-here-name" style={tint(peer)}>
              {peer.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** on a rail thumbnail: who is on that slide */
export function CollabThumbMarks({
  partPath,
  peers,
}: {
  partPath: string | undefined
  peers: PeerPresence[]
}) {
  const here = partPath ? peers.filter((p) => p.value.slide === partPath) : []
  if (!here.length) return null
  return (
    <span className="collab-thumb-marks" aria-hidden="true">
      {here.slice(0, 3).map((peer) => (
        <span
          key={peer.clientId}
          className="collab-thumb-mark"
          style={tint(peer)}
          title={peer.name}
        >
          {initialOf(peer.name)}
        </span>
      ))}
    </span>
  )
}
