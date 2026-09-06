import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DestinationsPanel } from './DestinationsPanel'

describe('DestinationsPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DestinationsPanel open={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Channels and Destinations lists with their dummy items when open', () => {
    render(<DestinationsPanel open />)

    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Google Drive folder')).toBeInTheDocument()
    expect(screen.getByText('Data store row')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
    expect(screen.getByText('Email → jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('Google Drive folder → Marketing')).toBeInTheDocument()
    expect(screen.getByText('Data store row → Leads table')).toBeInTheDocument()
  })
})
