import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const params = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const common = new Set([
  'password', 'password123', 'password1234', 'password123456', '123456789012345',
  '1234567890123456', 'qwerty123456789', 'qwertyuiop12345', 'admin1234567890',
  'tradersho123456', 'tradersho@123456', 'iloveyou12345678', '111111111111111',
  '000000000000000', 'abcdefghijklmnop', 'asdfghjkl1234567', 'letmein123456789',
])
const normalize = value => value.normalize('NFC')
export const tokenHash = value => createHash('sha256').update(value).digest('hex')

export function passwordError(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string') return 'رمز عبور معتبر نیست.'
  const value = normalize(password)
  if ([...value].length < 8) return 'رمز عبور باید دست‌کم ۸ کاراکتر داشته باشد.'
  if ([...value].length > 128 || Buffer.byteLength(value) > 1024) return 'رمز عبور باید حداکثر ۱۲۸ نویسه باشد.'
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9\s]/u.test(value)) return 'رمز باید شامل حرف کوچک و بزرگ انگلیسی، عدد و کاراکتر خاص باشد.'
  const lower = value.toLocaleLowerCase('en-US')
  const local = email.split('@')[0]?.toLocaleLowerCase('en-US') || ''
  if (common.has(lower) || (local.length >= 4 && lower.includes(local)) || lower.includes('tradersho')) return 'این رمز قابل حدس است؛ عبارت عبور متفاوت و اختصاصی انتخاب کنید.'
  if (name.trim().length >= 4 && lower.includes(name.trim().toLocaleLowerCase('en-US'))) return 'رمز عبور نباید شامل نام شما باشد.'
  if (/^(.)\1{7,}$/u.test(value)) return 'این رمز بسیار قابل حدس است؛ رمز متفاوت انتخاب کنید.'
  return null
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const result = await scrypt(normalize(password), Buffer.from(salt, 'hex'), 64, params)
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt}$${result.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  try {
    const parts = stored.split('$')
    if (parts[0] === 'scrypt' && parts.length === 6) {
      const [, n, r, p, salt, hex] = parts
      const expected = Buffer.from(hex, 'hex')
      if (expected.length !== 64) return false
      const result = await scrypt(normalize(password), Buffer.from(salt, 'hex'), 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 })
      return timingSafeEqual(result, expected)
    }
    // Accounts created before this migration used Node's default scrypt cost.
    const [salt, hex] = stored.split(':')
    const expected = Buffer.from(hex, 'hex')
    if (expected.length !== 64) return false
    const result = await scrypt(password, salt, 64)
    return timingSafeEqual(result, expected)
  } catch { return false }
}
