// The browser-local day/time sent alongside a send to an email destination
// -- see server/src/requestHandler.ts's /api/send: `localDate` ("yyyy-mm-dd")
// is the daily sequence counter's day-boundary key, `localTime`
// ("mm/dd/yyyy HH:mm", 24-hour, "no am/pm" per docs/CURRENT-WORK.md) goes
// into the subject line. Harmless to include on a send to any other
// destination type -- the server only reads them for email.
function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function localTimeLabel(date: Date = new Date()): string {
  const datePart = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${datePart} ${timePart}`
}
