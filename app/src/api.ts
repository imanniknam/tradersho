export interface User { id: string; name: string; email: string; plan: 'free' | 'plus' | 'pro'; createdAt: string; progress: Record<string, number> }
export interface Ticket { id: string; subject: string; message: string; status: string; createdAt: string }
export interface RebateRequest { id: string; broker: string; account: string; status: string; createdAt: string }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  } catch {
    throw new Error('ارتباط با سرور برقرار نشد. اتصال اینترنت و فعال بودن لینک دمو را بررسی کنید و دوباره تلاش کنید.')
  }
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) throw new Error(String(data.error || 'ارتباط با سرور برقرار نشد.'))
  return data as T
}
