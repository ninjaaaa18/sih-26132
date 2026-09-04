export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://127.0.0.1:8000')
export const DEMO_FARMER_ID = '00000000-2613-4261-8261-000000000001'

export async function apiFetch(path, options = {}) {
  const headers = options.body
    ? { 'Content-Type': 'application/json', ...options.headers }
    : options.headers
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = Array.isArray(body.detail)
        ? body.detail.map((item) => `${item.loc?.join('.') || 'field'}: ${item.msg}`).join('; ')
        : body.detail || message
    } catch {
      // Keep the HTTP status when the server response is not JSON.
    }
    throw new Error(message)
  }
  return response.json()
}
