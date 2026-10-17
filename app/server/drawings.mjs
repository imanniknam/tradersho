import { points } from './market.mjs'

const types = new Set(['horizontal', 'vertical', 'trend', 'ray', 'rectangle', 'fibonacci', 'measure'])
export function validateDrawings(value, cursor) {
  const invalid = () => { throw Object.assign(new Error('اطلاعات ترسیم معتبر نیست؛ فقط روی روزهای قابل مشاهده ترسیم کنید.'), { status: 400 }) }
  if (!Array.isArray(value) || value.length > 50) invalid()
  const ids = new Set()
  const dates = new Set(points.slice(0, cursor + 1).map(p => p.date))
  return value.map(drawing => {
    if (!drawing || !/^[a-f0-9-]{36}$/i.test(drawing.id) || ids.has(drawing.id) || !types.has(drawing.type)) invalid()
    ids.add(drawing.id)
    const count = ['horizontal', 'vertical'].includes(drawing.type) ? 1 : 2
    if (!Array.isArray(drawing.anchors) || drawing.anchors.length !== count) invalid()
    const anchors = drawing.anchors.map(anchor => {
      if (!anchor || !dates.has(anchor.date) || !Number.isFinite(anchor.value) || anchor.value <= 0 || anchor.value > 100) invalid()
      return { date: anchor.date, value: anchor.value }
    })
    return { id: drawing.id, type: drawing.type, anchors }
  })
}
