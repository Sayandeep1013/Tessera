# newt.sh — icon inventory

Captured from the live public page at 1440×900 (desktop) and 390×844 (mobile).
Every `<svg>` on the page, verbatim `outerHTML`, with the button it sits in.

**Family:** all UI glyphs are [Phosphor Icons](https://phosphoricons.com/) *Regular*
weight — `viewBox="0 0 256 256"`, single `<path>`, `fill="currentColor"`, **no stroke**
(computed `stroke: none`, so `stroke-width` / `stroke-linecap` / `stroke-linejoin` are
irrelevant — these are filled silhouettes, not stroked outlines).
Every glyph is authored `width="1em" height="1em"` and sized by Tailwind classes
(`h-3 w-3` = 12px, `h-4 w-4` = 16px, `h-5 w-5` = 20px, `h-6 w-6` = 24px).

The **only** exception is the Newt logo, which is hand-authored pixel art on a
16×16 grid built from `<rect>` elements with `shape-rendering="crispEdges"`.

---

## Desktop (1440×900) — 25 SVGs

### D #0 — File — new, recent, import

| field | value |
| --- | --- |
| icon box (page px) | x 16, y 12, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 16 16` |
| svg class | `h-full w-full group-hover:opacity-0` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 12, y 8, 101×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 8px |
| host text | "Newt" |

```html
<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" class="h-full w-full group-hover:opacity-0"><rect x="3" y="1" width="3" height="1"></rect><rect x="10" y="1" width="3" height="1"></rect><rect x="2" y="2" width="1" height="1"></rect><rect x="6" y="2" width="1" height="1"></rect><rect x="9" y="2" width="1" height="1"></rect><rect x="13" y="2" width="1" height="1"></rect><rect x="2" y="3" width="1" height="1"></rect><rect x="4" y="3" width="1" height="1"></rect><rect x="6" y="3" width="1" height="1"></rect><rect x="9" y="3" width="1" height="1"></rect><rect x="11" y="3" width="1" height="1"></rect><rect x="13" y="3" width="1" height="1"></rect><rect x="2" y="4" width="1" height="1"></rect><rect x="4" y="4" width="1" height="1"></rect><rect x="6" y="4" width="1" height="1"></rect><rect x="9" y="4" width="1" height="1"></rect><rect x="11" y="4" width="1" height="1"></rect><rect x="13" y="4" width="1" height="1"></rect><rect x="1" y="5" width="1" height="1"></rect><rect x="4" y="5" width="1" height="1"></rect><rect x="6" y="5" width="4" height="1"></rect><rect x="11" y="5" width="1" height="1"></rect><rect x="14" y="5" width="1" height="1"></rect><rect x="0" y="6" width="1" height="1"></rect><rect x="7" y="6" width="2" height="1"></rect><rect x="15" y="6" width="1" height="1"></rect><rect x="0" y="7" width="1" height="1"></rect><rect x="15" y="7" width="1" height="1"></rect><rect x="0" y="8" width="1" height="1"></rect><rect x="2" y="8" width="1" height="1"></rect><rect x="13" y="8" width="1" height="1"></rect><rect x="15" y="8" width="1" height="1"></rect><rect x="0" y="9" width="1" height="1"></rect><rect x="3" y="9" width="10" height="1"></rect><rect x="15" y="9" width="1" height="1"></rect><rect x="0" y="10" width="1" height="1"></rect><rect x="15" y="10" width="1" height="1"></rect><rect x="1" y="11" width="1" height="1"></rect><rect x="14" y="11" width="1" height="1"></rect><rect x="1" y="12" width="3" height="1"></rect><rect x="12" y="12" width="3" height="1"></rect><rect x="3" y="13" width="2" height="1"></rect><rect x="11" y="13" width="2" height="1"></rect><rect x="4" y="14" width="8" height="1"></rect></svg>
```

### D #1 — File — new, recent, import

| field | value |
| --- | --- |
| icon box (page px) | x 16, y 12, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 16 16` |
| svg class | `absolute inset-0 h-full w-full opacity-0 group-hover:opacity-100` |
| fill (computed) | rgb(0, 0, 0) |
| stroke (computed) | none · width 1px |
| opacity | 0 |
| host element | `<button>`   |
| host box (page px) | x 12, y 8, 101×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 8px |
| host text | "Newt" |

```html
<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" class="absolute inset-0 h-full w-full opacity-0 group-hover:opacity-100"><rect x="3" y="1" width="3" height="1" fill="#191e43"></rect><rect x="10" y="1" width="3" height="1" fill="#191e43"></rect><rect x="2" y="2" width="1" height="1" fill="#191e43"></rect><rect x="3" y="2" width="3" height="1" fill="#79d265"></rect><rect x="6" y="2" width="1" height="1" fill="#191e43"></rect><rect x="9" y="2" width="1" height="1" fill="#191e43"></rect><rect x="10" y="2" width="3" height="1" fill="#79d265"></rect><rect x="13" y="2" width="1" height="1" fill="#191e43"></rect><rect x="2" y="3" width="1" height="1" fill="#191e43"></rect><rect x="3" y="3" width="1" height="1" fill="#79d265"></rect><rect x="4" y="3" width="1" height="1" fill="#191e43"></rect><rect x="5" y="3" width="1" height="1" fill="#79d265"></rect><rect x="6" y="3" width="1" height="1" fill="#191e43"></rect><rect x="9" y="3" width="1" height="1" fill="#191e43"></rect><rect x="10" y="3" width="1" height="1" fill="#79d265"></rect><rect x="11" y="3" width="1" height="1" fill="#191e43"></rect><rect x="12" y="3" width="1" height="1" fill="#79d265"></rect><rect x="13" y="3" width="1" height="1" fill="#191e43"></rect><rect x="2" y="4" width="1" height="1" fill="#191e43"></rect><rect x="3" y="4" width="1" height="1" fill="#79d265"></rect><rect x="4" y="4" width="1" height="1" fill="#191e43"></rect><rect x="5" y="4" width="1" height="1" fill="#79d265"></rect><rect x="6" y="4" width="1" height="1" fill="#191e43"></rect><rect x="9" y="4" width="1" height="1" fill="#191e43"></rect><rect x="10" y="4" width="1" height="1" fill="#79d265"></rect><rect x="11" y="4" width="1" height="1" fill="#191e43"></rect><rect x="12" y="4" width="1" height="1" fill="#79d265"></rect><rect x="13" y="4" width="1" height="1" fill="#191e43"></rect><rect x="1" y="5" width="1" height="1" fill="#191e43"></rect><rect x="2" y="5" width="2" height="1" fill="#79d265"></rect><rect x="4" y="5" width="1" height="1" fill="#191e43"></rect><rect x="5" y="5" width="1" height="1" fill="#79d265"></rect><rect x="6" y="5" width="4" height="1" fill="#191e43"></rect><rect x="10" y="5" width="1" height="1" fill="#79d265"></rect><rect x="11" y="5" width="1" height="1" fill="#191e43"></rect><rect x="12" y="5" width="1" height="1" fill="#79d265"></rect><rect x="13" y="5" width="1" height="1" fill="#9dee72"></rect><rect x="14" y="5" width="1" height="1" fill="#191e43"></rect><rect x="0" y="6" width="1" height="1" fill="#191e43"></rect><rect x="1" y="6" width="6" height="1" fill="#79d265"></rect><rect x="7" y="6" width="2" height="1" fill="#191e43"></rect><rect x="9" y="6" width="5" height="1" fill="#79d265"></rect><rect x="14" y="6" width="1" height="1" fill="#9dee72"></rect><rect x="15" y="6" width="1" height="1" fill="#191e43"></rect><rect x="0" y="7" width="1" height="1" fill="#191e43"></rect><rect x="1" y="7" width="2" height="1" fill="#79d265"></rect><rect x="3" y="7" width="2" height="1" fill="#e56666"></rect><rect x="5" y="7" width="6" height="1" fill="#79d265"></rect><rect x="11" y="7" width="2" height="1" fill="#e56666"></rect><rect x="13" y="7" width="2" height="1" fill="#79d265"></rect><rect x="15" y="7" width="1" height="1" fill="#191e43"></rect><rect x="0" y="8" width="1" height="1" fill="#191e43"></rect><rect x="1" y="8" width="1" height="1" fill="#79d265"></rect><rect x="2" y="8" width="1" height="1" fill="#191e43"></rect><rect x="3" y="8" width="10" height="1" fill="#79d265"></rect><rect x="13" y="8" width="1" height="1" fill="#191e43"></rect><rect x="14" y="8" width="1" height="1" fill="#79d265"></rect><rect x="15" y="8" width="1" height="1" fill="#191e43"></rect><rect x="0" y="9" width="1" height="1" fill="#191e43"></rect><rect x="1" y="9" width="1" height="1" fill="#33993a"></rect><rect x="2" y="9" width="1" height="1" fill="#79d265"></rect><rect x="3" y="9" width="10" height="1" fill="#191e43"></rect><rect x="13" y="9" width="2" height="1" fill="#79d265"></rect><rect x="15" y="9" width="1" height="1" fill="#191e43"></rect><rect x="0" y="10" width="1" height="1" fill="#191e43"></rect><rect x="1" y="10" width="2" height="1" fill="#33993a"></rect><rect x="3" y="10" width="12" height="1" fill="#79d265"></rect><rect x="15" y="10" width="1" height="1" fill="#191e43"></rect><rect x="1" y="11" width="1" height="1" fill="#191e43"></rect><rect x="2" y="11" width="3" height="1" fill="#33993a"></rect><rect x="5" y="11" width="9" height="1" fill="#79d265"></rect><rect x="14" y="11" width="1" height="1" fill="#191e43"></rect><rect x="1" y="12" width="3" height="1" fill="#191e43"></rect><rect x="4" y="12" width="2" height="1" fill="#33993a"></rect><rect x="6" y="12" width="6" height="1" fill="#79d265"></rect><rect x="12" y="12" width="3" height="1" fill="#191e43"></rect><rect x="3" y="13" width="2" height="1" fill="#191e43"></rect><rect x="5" y="13" width="6" height="1" fill="#33993a"></rect><rect x="11" y="13" width="2" height="1" fill="#191e43"></rect><rect x="4" y="14" width="8" height="1" fill="#191e43"></rect></svg>
```

### D #2 — File — new, recent, import

| field | value |
| --- | --- |
| icon box (page px) | x 91, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4 flex-none text-faint transition-transform` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 12, y 8, 101×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 8px |
| host text | "Newt" |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4 flex-none text-faint transition-transform"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
```

### D #3 — Settings

| field | value |
| --- | --- |
| icon box (page px) | x 125, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 117, y 6, 36×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z"></path></svg>
```

### D #4 — Smaller brush

| field | value |
| --- | --- |
| icon box (page px) | x 215, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 209, y 10, 28×28 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"></path></svg>
```

### D #5 — Bigger brush

| field | value |
| --- | --- |
| icon box (page px) | x 283, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 277, y 10, 28×28 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>
```

### D #6 — Pixel-perfect — remove doubled corners on diagonals

| field | value |
| --- | --- |
| icon box (page px) | x 324, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 318, y 10, 28×28 |
| host background | rgb(255, 255, 255) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M200,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V40A16,16,0,0,0,200,24Zm-40,80h40v24H160Zm-48,40h88v24H112Zm88,72H56V184H200v32Z"></path></svg>
```

### D #7 — Dither: Solid

| field | value |
| --- | --- |
| icon box (page px) | x 555, y 18, 12×12 |
| rendered size | 12px × 12px |
| viewBox | `0 0 256 256` |
| svg class | `h-3 w-3 text-muted` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 489, y 10, 87×28 |
| host background | rgb(241, 241, 244) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |
| host text | "Solid" |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-3 w-3 text-muted"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
```

### D #8 — Share — post to community, export PNG

| field | value |
| --- | --- |
| icon box (page px) | x 1130, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1118, y 6, 108×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |
| host text | "Share" |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z"></path></svg>
```

### D #9 — Share — post to community, export PNG

| field | value |
| --- | --- |
| icon box (page px) | x 1200, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4 flex-none text-faint transition-transform` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1118, y 6, 108×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |
| host text | "Share" |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4 flex-none text-faint transition-transform"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
```

### D #10 — Code & Export

| field | value |
| --- | --- |
| icon box (page px) | x 1238, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1230, y 6, 36×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z"></path></svg>
```

### D #11 — Animation timeline

| field | value |
| --- | --- |
| icon box (page px) | x 1278, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1270, y 6, 36×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,88h80v80H40Zm96-16V56h32V72Zm-16,0H88V56h32Zm0,112v16H88V184Zm16,0h32v16H136Zm0-16V88h80v80Zm80-96H184V56h32ZM72,56V72H40V56ZM40,184H72v16H40Zm176,16H184V184h32v16Z"></path></svg>
```

### D #12 — Layers

| field | value |
| --- | --- |
| icon box (page px) | x 1318, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1310, y 6, 36×36 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M12,111l112,64a8,8,0,0,0,7.94,0l112-64a8,8,0,0,0,0-13.9l-112-64a8,8,0,0,0-7.94,0l-112,64A8,8,0,0,0,12,111ZM128,49.21,223.87,104,128,158.79,32.13,104ZM246.94,140A8,8,0,0,1,244,151L132,215a8,8,0,0,1-7.94,0L12,151A8,8,0,0,1,20,137.05l108,61.74,108-61.74A8,8,0,0,1,246.94,140Z"></path></svg>
```

### D #13 — Select / Move (V)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 294, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 284, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z"></path></svg>
```

### D #14 — Brush (B)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 342, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(255, 255, 255) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 332, 44×44 |
| host background | rgb(24, 24, 27) |
| host color | rgb(255, 255, 255) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM124.42,113.55q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z"></path></svg>
```

### D #15 — Eraser (E)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 390, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 380, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM108.68,208H70.05L42.33,180.28a8,8,0,0,1,0-11.31L96,115.31,148.69,168Zm105-105L160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z"></path></svg>
```

### D #16 — Fill (G)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 438, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 428, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M234.53,139.07a8,8,0,0,0,3.13-13.24L122.17,10.34a8,8,0,0,0-11.31,0L70.25,51,45.65,26.34A8,8,0,0,0,34.34,37.66l24.6,24.6L15,106.17a24,24,0,0,0,0,33.94L99.89,225a24,24,0,0,0,33.94,0l78.49-78.49Zm-32.19-5.24-79.83,79.83a8,8,0,0,1-11.31,0L26.34,128.8a8,8,0,0,1,0-11.31L70.25,73.57l29.12,29.12a28,28,0,1,0,11.31-11.32L81.57,62.26l35-34.95L217.19,128l-11.72,3.9A8.09,8.09,0,0,0,202.34,133.83Zm-86.83-26.31,0,0a13.26,13.26,0,1,1-.05.06S115.51,107.53,115.51,107.52Zm123.15,56a8,8,0,0,0-13.32,0C223.57,166.23,208,190.09,208,208a24,24,0,0,0,48,0C256,190.09,240.43,166.23,238.66,163.56ZM232,216a8,8,0,0,1-8-8c0-6.8,4-16.32,8-24.08,4,7.76,8,17.34,8,24.08A8,8,0,0,1,232,216Z"></path></svg>
```

### D #17 — Shapes (U)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 486, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 476, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208Z"></path></svg>
```

### D #18 — Select region (M)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 534, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 524, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z"></path></svg>
```

### D #19 — Eyedropper (I)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 582, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 572, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L142.8,62.2a24,24,0,0,0-33.14.77l-9,9a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l9-9a24,24,0,0,0,.74-33.18l19.75-19.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34ZM202.13,82l-25.37,25.52a8,8,0,0,0,0,11.3l4.89,4.89a8,8,0,0,1,0,11.32l-9,9L112,83.26l9-9a8,8,0,0,1,11.31,0l4.89,4.89a8,8,0,0,0,11.33,0l24.94-25.09c7.81-7.82,20.5-8.18,28.29-.81a20,20,0,0,1,.39,28.7Z"></path></svg>
```

### D #20 — Gradient (H)

| field | value |
| --- | --- |
| icon box (page px) | x 28, y 630, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 620, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-64,80h64v16H136Zm0-16V88h64v16Zm0,48h64v16H136Zm64-80H136V56h64ZM56,56h64V200H56ZM200,200H136V184h64v16Z"></path></svg>
```

### D #21 — AI options

| field | value |
| --- | --- |
| icon box (page px) | x 26, y 852, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 20, y 846, 32×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>
```

### D #22 — Send

| field | value |
| --- | --- |
| icon box (page px) | x 300, y 854, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`  **disabled** |
| host box (page px) | x 292, y 846, 32×32 |
| host background | rgb(241, 241, 244) |
| host color | rgb(161, 161, 170) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"></path></svg>
```

### D #23 — Zoom out (⌘−)

| field | value |
| --- | --- |
| icon box (page px) | x 1316, y 860, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1308, y 852, 32×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"></path></svg>
```

### D #24 — Zoom in (⌘+)

| field | value |
| --- | --- |
| icon box (page px) | x 1400, y 860, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 1392, y 852, 32×32 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>
```

---

## Mobile (390×844) — 20 SVGs

Only the icons that do **not** appear in the desktop list are new here (Undo, Redo,
“More”); the rest are the same artwork at different positions.

### M #0 — File — new, recent, import

| field | value |
| --- | --- |
| icon box (page px) | x 16, y 12, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 16 16` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 8, y 4, 56×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" class="h-6 w-6"><rect x="3" y="1" width="3" height="1"></rect><rect x="10" y="1" width="3" height="1"></rect><rect x="2" y="2" width="1" height="1"></rect><rect x="6" y="2" width="1" height="1"></rect><rect x="9" y="2" width="1" height="1"></rect><rect x="13" y="2" width="1" height="1"></rect><rect x="2" y="3" width="1" height="1"></rect><rect x="4" y="3" width="1" height="1"></rect><rect x="6" y="3" width="1" height="1"></rect><rect x="9" y="3" width="1" height="1"></rect><rect x="11" y="3" width="1" height="1"></rect><rect x="13" y="3" width="1" height="1"></rect><rect x="2" y="4" width="1" height="1"></rect><rect x="4" y="4" width="1" height="1"></rect><rect x="6" y="4" width="1" height="1"></rect><rect x="9" y="4" width="1" height="1"></rect><rect x="11" y="4" width="1" height="1"></rect><rect x="13" y="4" width="1" height="1"></rect><rect x="1" y="5" width="1" height="1"></rect><rect x="4" y="5" width="1" height="1"></rect><rect x="6" y="5" width="4" height="1"></rect><rect x="11" y="5" width="1" height="1"></rect><rect x="14" y="5" width="1" height="1"></rect><rect x="0" y="6" width="1" height="1"></rect><rect x="7" y="6" width="2" height="1"></rect><rect x="15" y="6" width="1" height="1"></rect><rect x="0" y="7" width="1" height="1"></rect><rect x="15" y="7" width="1" height="1"></rect><rect x="0" y="8" width="1" height="1"></rect><rect x="2" y="8" width="1" height="1"></rect><rect x="13" y="8" width="1" height="1"></rect><rect x="15" y="8" width="1" height="1"></rect><rect x="0" y="9" width="1" height="1"></rect><rect x="3" y="9" width="10" height="1"></rect><rect x="15" y="9" width="1" height="1"></rect><rect x="0" y="10" width="1" height="1"></rect><rect x="15" y="10" width="1" height="1"></rect><rect x="1" y="11" width="1" height="1"></rect><rect x="14" y="11" width="1" height="1"></rect><rect x="1" y="12" width="3" height="1"></rect><rect x="12" y="12" width="3" height="1"></rect><rect x="3" y="13" width="2" height="1"></rect><rect x="11" y="13" width="2" height="1"></rect><rect x="4" y="14" width="8" height="1"></rect></svg>
```

### M #1 — File — new, recent, import

| field | value |
| --- | --- |
| icon box (page px) | x 42, y 16, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4 flex-none text-faint transition-transform` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 8, y 4, 56×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4 flex-none text-faint transition-transform"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
```

### M #2 — Settings

| field | value |
| --- | --- |
| icon box (page px) | x 76, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 66, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z"></path></svg>
```

### M #3 — Undo

| field | value |
| --- | --- |
| icon box (page px) | x 184, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`  **disabled** |
| host box (page px) | x 174, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(161, 161, 170) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M232,144a64.07,64.07,0,0,1-64,64H80a8,8,0,0,1,0-16h88a48,48,0,0,0,0-96H51.31l34.35,34.34a8,8,0,0,1-11.32,11.32l-48-48a8,8,0,0,1,0-11.32l48-48A8,8,0,0,1,85.66,45.66L51.31,80H168A64.07,64.07,0,0,1,232,144Z"></path></svg>
```

### M #4 — Redo

| field | value |
| --- | --- |
| icon box (page px) | x 226, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(161, 161, 170) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`  **disabled** |
| host box (page px) | x 216, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(161, 161, 170) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M170.34,130.34,204.69,96H88a48,48,0,0,0,0,96h88a8,8,0,0,1,0,16H88A64,64,0,0,1,88,80H204.69L170.34,45.66a8,8,0,0,1,11.32-11.32l48,48a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32-11.32Z"></path></svg>
```

### M #5 — Layers

| field | value |
| --- | --- |
| icon box (page px) | x 268, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 258, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M12,111l112,64a8,8,0,0,0,7.94,0l112-64a8,8,0,0,0,0-13.9l-112-64a8,8,0,0,0-7.94,0l-112,64A8,8,0,0,0,12,111ZM128,49.21,223.87,104,128,158.79,32.13,104ZM246.94,140A8,8,0,0,1,244,151L132,215a8,8,0,0,1-7.94,0L12,151A8,8,0,0,1,20,137.05l108,61.74,108-61.74A8,8,0,0,1,246.94,140Z"></path></svg>
```

### M #6 — Animation timeline

| field | value |
| --- | --- |
| icon box (page px) | x 310, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 300, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,88h80v80H40Zm96-16V56h32V72Zm-16,0H88V56h32Zm0,112v16H88V184Zm16,0h32v16H136Zm0-16V88h80v80Zm80-96H184V56h32ZM72,56V72H40V56ZM40,184H72v16H40Zm176,16H184V184h32v16Z"></path></svg>
```

### M #7 — More

| field | value |
| --- | --- |
| icon box (page px) | x 352, y 14, 20×20 |
| rendered size | 20px × 20px |
| viewBox | `0 0 256 256` |
| svg class | `h-5 w-5` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 342, y 4, 40×40 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-5 w-5"><path d="M144,128a16,16,0,1,1-16-16A16,16,0,0,1,144,128ZM60,112a16,16,0,1,0,16,16A16,16,0,0,0,60,112Zm136,0a16,16,0,1,0,16,16A16,16,0,0,0,196,112Z"></path></svg>
```

### M #8 — Smaller brush

| field | value |
| --- | --- |
| icon box (page px) | x 24, y 751, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 18, y 745, 28×28 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"></path></svg>
```

### M #9 — Bigger brush

| field | value |
| --- | --- |
| icon box (page px) | x 92, y 751, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 86, y 745, 28×28 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>
```

### M #10 — Pixel-perfect — remove doubled corners on diagonals

| field | value |
| --- | --- |
| icon box (page px) | x 133, y 751, 16×16 |
| rendered size | 16px × 16px |
| viewBox | `0 0 256 256` |
| svg class | `h-4 w-4` |
| fill (computed) | rgb(24, 24, 27) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 127, y 745, 28×28 |
| host background | rgb(255, 255, 255) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-4 w-4"><path d="M200,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V40A16,16,0,0,0,200,24Zm-40,80h40v24H160Zm-48,40h88v24H112Zm88,72H56V184H200v32Z"></path></svg>
```

### M #11 — Dither: Solid

| field | value |
| --- | --- |
| icon box (page px) | x 364, y 753, 12×12 |
| rendered size | 12px × 12px |
| viewBox | `0 0 256 256` |
| svg class | `h-3 w-3 text-muted` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>`   |
| host box (page px) | x 297, y 745, 87×28 |
| host background | rgb(241, 241, 244) |
| host color | rgb(24, 24, 27) |
| host radius | 9999px (pill) |
| host text | "Solid" |

_Same artwork as an earlier entry in this file._

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-3 w-3 text-muted"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>
```

### M #12 — Select / Move (V)

| field | value |
| --- | --- |
| icon box (page px) | x 68, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 58, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z"></path></svg>
```

### M #13 — Brush (B)

| field | value |
| --- | --- |
| icon box (page px) | x 116, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(255, 255, 255) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=true  |
| host box (page px) | x 106, y 792, 44×44 |
| host background | rgb(24, 24, 27) |
| host color | rgb(255, 255, 255) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM124.42,113.55q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z"></path></svg>
```

### M #14 — Eraser (E)

| field | value |
| --- | --- |
| icon box (page px) | x 164, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 154, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM108.68,208H70.05L42.33,180.28a8,8,0,0,1,0-11.31L96,115.31,148.69,168Zm105-105L160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z"></path></svg>
```

### M #15 — Fill (G)

| field | value |
| --- | --- |
| icon box (page px) | x 212, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 202, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M234.53,139.07a8,8,0,0,0,3.13-13.24L122.17,10.34a8,8,0,0,0-11.31,0L70.25,51,45.65,26.34A8,8,0,0,0,34.34,37.66l24.6,24.6L15,106.17a24,24,0,0,0,0,33.94L99.89,225a24,24,0,0,0,33.94,0l78.49-78.49Zm-32.19-5.24-79.83,79.83a8,8,0,0,1-11.31,0L26.34,128.8a8,8,0,0,1,0-11.31L70.25,73.57l29.12,29.12a28,28,0,1,0,11.31-11.32L81.57,62.26l35-34.95L217.19,128l-11.72,3.9A8.09,8.09,0,0,0,202.34,133.83Zm-86.83-26.31,0,0a13.26,13.26,0,1,1-.05.06S115.51,107.53,115.51,107.52Zm123.15,56a8,8,0,0,0-13.32,0C223.57,166.23,208,190.09,208,208a24,24,0,0,0,48,0C256,190.09,240.43,166.23,238.66,163.56ZM232,216a8,8,0,0,1-8-8c0-6.8,4-16.32,8-24.08,4,7.76,8,17.34,8,24.08A8,8,0,0,1,232,216Z"></path></svg>
```

### M #16 — Shapes (U)

| field | value |
| --- | --- |
| icon box (page px) | x 260, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 250, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208Z"></path></svg>
```

### M #17 — Select region (M)

| field | value |
| --- | --- |
| icon box (page px) | x 308, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 298, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z"></path></svg>
```

### M #18 — Eyedropper (I)

| field | value |
| --- | --- |
| icon box (page px) | x 356, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 346, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L142.8,62.2a24,24,0,0,0-33.14.77l-9,9a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l9-9a24,24,0,0,0,.74-33.18l19.75-19.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34ZM202.13,82l-25.37,25.52a8,8,0,0,0,0,11.3l4.89,4.89a8,8,0,0,1,0,11.32l-9,9L112,83.26l9-9a8,8,0,0,1,11.31,0l4.89,4.89a8,8,0,0,0,11.33,0l24.94-25.09c7.81-7.82,20.5-8.18,28.29-.81a20,20,0,0,1,.39,28.7Z"></path></svg>
```

### M #19 — Gradient (H)

| field | value |
| --- | --- |
| icon box (page px) | x 404, y 802, 24×24 |
| rendered size | 24px × 24px |
| viewBox | `0 0 256 256` |
| svg class | `h-6 w-6` |
| fill (computed) | rgb(113, 113, 122) |
| stroke (computed) | none · width 1px |
| opacity | 1 |
| host element | `<button>` aria-pressed=false  |
| host box (page px) | x 394, y 792, 44×44 |
| host background | rgba(0, 0, 0, 0) |
| host color | rgb(113, 113, 122) |
| host radius | 12px |

```html
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="h-6 w-6"><path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-64,80h64v16H136Zm0-16V88h64v16Zm0,48h64v16H136Zm64-80H136V56h64ZM56,56h64V200H56ZM200,200H136V184h64v16Z"></path></svg>
```
