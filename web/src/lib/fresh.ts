// `#fresh` link (kahati-app.vercel.app/#fresh): start with an empty month.
// Imported first in main.tsx so it runs before the API adapter reads its saved state.
// Normal reloads keep the saved month; only this link wipes it (language and consent stay).
export const startedFresh = (() => {
  if (!/^#fresh\b/.test(window.location.hash)) return false
  try {
    localStorage.removeItem('kahati-http-v1')
  } catch {
    /* storage unavailable: nothing saved to wipe */
  }
  try {
    history.replaceState(null, '', '/')
  } catch {
    /* ignore */
  }
  return true
})()
