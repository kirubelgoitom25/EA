import { supabase } from './supabase.js'

const BASE = import.meta.env.VITE_API_URL
const TIMEOUT_MS = 45000
const RETRY_DELAY_MS = 2000
const RETRY_STATUS = [502, 503, 504]

// The backend sends this exact text when an account has been turned off.
const ACCOUNT_OFF = 'This account is turned off.'
export const ACCOUNT_OFF_TEXT =
  'This account has been turned off. Please contact the administrator.'

// A note left for the login page to show once, for example after being signed out.
export const LOGIN_NOTICE_KEY = 'login-notice'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  // Only GET is retried (safe to repeat). A sleeping server often fails once, then works.
  const method = (options.method || 'GET').toUpperCase()
  const attempts = method === 'GET' ? 2 : 1

  let res
  for (let i = 0; i < attempts; i += 1) {
    const lastTry = i === attempts - 1
    try {
      res = await fetch(`${BASE}${path}`, {
        ...options,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      })
    } catch {
      if (lastTry) throw new Error('Cannot reach the server. Check your connection and try again.')
      await sleep(RETRY_DELAY_MS)
      continue
    }
    if (RETRY_STATUS.includes(res.status) && !lastTry) {
      await sleep(RETRY_DELAY_MS)
      continue
    }
    break
  }

  let body = null
  try { body = await res.json() } catch { /* empty body */ }

  if (res.status === 401) {
    await supabase.auth.signOut()
    throw new Error('Your session expired. Please log in again.')
  }

  // Turned-off account: leave a note for the login page, then sign out.
  if (res.status === 403 && body?.detail === ACCOUNT_OFF) {
    try { sessionStorage.setItem(LOGIN_NOTICE_KEY, ACCOUNT_OFF_TEXT) } catch { /* ignore */ }
    await supabase.auth.signOut()
    throw new Error(ACCOUNT_OFF_TEXT)
  }

  if (!res.ok) throw new Error(body?.detail || 'Something went wrong.')
  return body
}

export const api = {
  get: (path) => request(path),
  put: (path, json) => request(path, { method: 'PUT', body: JSON.stringify(json) }),
}