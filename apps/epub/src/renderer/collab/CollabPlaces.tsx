/** The status line's list of the people reading another chapter; a press goes there. */
import { collabColorVar } from '@genoffice/collab'
import type { PeerPlace } from './presence'
import './collab.css'

export function CollabPlaces(p: {
  places: readonly PeerPlace[]
  chapterName(spineIndex: number): string
  onPick(place: PeerPlace): void
}) {
  if (p.places.length === 0) return null
  return (
    <span className="epub-collab-places">
      {p.places.map((place) => (
        <button
          key={place.clientId}
          type="button"
          className="epub-collab-place"
          style={{ ['--collab-c' as string]: collabColorVar(place.palette) }}
          onClick={() => p.onPick(place)}
        >
          {place.name} · {p.chapterName(place.spineIndex)}
        </button>
      ))}
    </span>
  )
}
