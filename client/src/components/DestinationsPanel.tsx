interface Channel {
  id: string
  name: string
}

interface Destination {
  id: string
  label: string
}

// Placeholder data -- there's no MCP Host or channel/destination config yet
// (see docs/IDEAS.md's Pending items), so both lists are hardcoded stand-ins
// for what this panel will eventually show live.
const DUMMY_CHANNELS: Channel[] = [
  { id: 'email', name: 'Email' },
  { id: 'gdrive-folder', name: 'Google Drive folder' },
  { id: 'data-store-row', name: 'Data store row' },
]

const DUMMY_DESTINATIONS: Destination[] = [
  { id: 'jane-email', label: 'Email → jane@example.com' },
  { id: 'marketing-folder', label: 'Google Drive folder → Marketing' },
  { id: 'leads-table', label: 'Data store row → Leads table' },
]

interface DestinationsPanelProps {
  open: boolean
}

// The right-side panel from docs/REQUIREMENTS.md's Destination sidebar flow,
// extended per docs/IDEAS.md's Pending item 1 to show two lists rather than
// one -- channels (the available destination types) and destinations (the
// configured instances created from a channel + its config). Dummy data
// only, display only, for now -- see docs/CURRENT-WORK.md's Group A.
export function DestinationsPanel({ open }: DestinationsPanelProps) {
  if (!open) return null

  return (
    <aside className="destinations-panel" aria-label="Channels and destinations">
      <section>
        <h2>Channels</h2>
        <ul>
          {DUMMY_CHANNELS.map((channel) => (
            <li key={channel.id}>{channel.name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Destinations</h2>
        <ul>
          {DUMMY_DESTINATIONS.map((destination) => (
            <li key={destination.id}>{destination.label}</li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
