import { google } from 'googleapis'
import { getAuthorizedClient } from './googleAuth.js'
import { GoogleNotConnectedError } from './googleDocs.js'

async function requireAuthorizedClient(userId: string) {
  const client = await getAuthorizedClient(userId)
  if (!client) throw new GoogleNotConnectedError()
  return client
}

// Sends a plain-text email via the Gmail API, using the `gmail.send` scope
// granted by the "connect Google as a destination" flow (googleAuth.ts's
// GOOGLE_SCOPES) -- the same connection the Google Doc destination uses, not
// a separate one. No explicit `From` header: Gmail fills that in with the
// connected account's own address, which is what "email to someone" (sent
// as the signed-in user, not as Dispatch Desk) is meant to look like.
export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const auth = await requireAuthorizedClient(userId)
  const gmail = google.gmail({ version: 'v1', auth })
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(message).toString('base64url') },
  })
}
