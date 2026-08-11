/** Darkest / most-extreme pixel inside a CSS-px box, vs a reference bg pixel. */
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
const png = PNG.sync.read(readFileSync(process.argv[2]!))
const scale = 2
function lum(c: number[]) {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
}
for (const spec of process.argv.slice(3)) {
  const [label, x, y, w, h, bxs, bys] = spec.split(',')
  const X = Number(x) * scale, Y = Number(y) * scale, W = Number(w) * scale, H = Number(h) * scale
  const bo = (Math.round(Number(bys) * scale) * png.width + Math.round(Number(bxs) * scale)) * 4
  const bg = [png.data[bo], png.data[bo + 1], png.data[bo + 2]] as number[]
  const lb = lum(bg)
  let best: number[] = bg, bestD = 0
  for (let yy = Y; yy < Y + H; yy++) for (let xx = X; xx < X + W; xx++) {
    const o = (yy * png.width + xx) * 4
    const c = [png.data[o], png.data[o + 1], png.data[o + 2]] as number[]
    const d = Math.abs(lum(c) - lb)
    if (d > bestD) { bestD = d; best = c }
  }
  const l1 = Math.max(lum(best), lb), l2 = Math.min(lum(best), lb)
  console.log(`${label!.padEnd(34)} extreme rgb(${best}) vs bg rgb(${bg})  contrast ${Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100}`)
}
