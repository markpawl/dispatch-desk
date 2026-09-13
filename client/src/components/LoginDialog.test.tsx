import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LoginDialog } from './LoginDialog'

describe('LoginDialog', () => {
  it('does not show login options until "Log In" is clicked', () => {
    render(<LoginDialog />)
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  })

  it('opens a popover listing "Sign in with Google" on click', async () => {
    const user = userEvent.setup()
    render(<LoginDialog />)
    await user.click(screen.getByRole('button', { name: 'Log In' }))
    const link = screen.getByRole('link', { name: 'Sign in with Google' })
    expect(link).toHaveAttribute('href', '/auth/login/google')
  })

  it('closes when clicking outside the popover', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <LoginDialog />
        <button type="button">elsewhere</button>
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Log In' }))
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  })
})
