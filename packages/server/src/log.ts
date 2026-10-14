// Plain console logging, which Supervisor shows on the app's Log tab.
//
// Never log personal data: no names, phone numbers, emails or note text.
// Request logs carry the method, route pattern, status and duration only.
export const log = {
  info: (message: string) => console.log(`[info] ${message}`),
  warn: (message: string) => console.warn(`[warn] ${message}`),
  error: (message: string) => console.error(`[error] ${message}`),
};
