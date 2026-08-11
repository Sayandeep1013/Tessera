/**
 * Pixel-exact visual extraction of the public https://newt.sh/ page.
 *
 * Public-page inspection only — the DevTools equivalent of viewing the site.
 * No authentication, no clicking, no private endpoints. Hover only.
 *
 *   npx tsx tools/extract-newt.ts
 *
 * NOTE: every browser-side payload below is a plain STRING, never a TS
 * function. tsx compiles with esbuild `keepNames`, which injects a `__name`
 * helper that does not exist inside page.evaluate.
 */

import { chromium, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'https://newt.sh/'
const OUT = join(process.cwd(), 'docs', 'research', 'newt')
const SHOTS = join(OUT, 'shots')

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
]

/* ------------------------------------------------------------------ */
/* 1. Nested DOM + computed style tree                                 */
/* ------------------------------------------------------------------ */

const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'padding', 'gap', 'rowGap', 'columnGap',
  'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'flex',
  'gridTemplateColumns', 'gridTemplateRows',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'textTransform', 'textAlign', 'whiteSpace',
  'color', 'backgroundColor', 'backgroundImage', 'backgroundSize',
  'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'borderRadius', 'outline', 'boxShadow', 'opacity', 'zIndex',
  'transform', 'transformOrigin', 'overflow', 'overflowX', 'overflowY',
  'cursor', 'pointerEvents', 'visibility', 'boxSizing', 'transition',
  'backdropFilter', 'filter', 'fill', 'stroke', 'strokeWidth', 'objectFit',
  'imageRendering', 'userSelect', 'textOverflow', 'isolation', 'mixBlendMode',
]

const TREE = `(() => {
  var PROPS = ${JSON.stringify(STYLE_PROPS)};
  var DEFAULTS = {
    display: 'block', position: 'static', top: 'auto', right: 'auto',
    bottom: 'auto', left: 'auto', minWidth: '0px', minHeight: '0px',
    maxWidth: 'none', maxHeight: 'none', margin: '0px', padding: '0px',
    gap: 'normal', rowGap: 'normal', columnGap: 'normal',
    flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'normal',
    justifyContent: 'normal', flex: '0 1 auto',
    gridTemplateColumns: 'none', gridTemplateRows: 'none',
    fontStyle: 'normal', letterSpacing: 'normal', textTransform: 'none',
    textAlign: 'start', whiteSpace: 'normal',
    backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
    backgroundSize: 'auto', borderRadius: '0px', outline: 'rgb(0, 0, 0) none 0px',
    boxShadow: 'none', opacity: '1', zIndex: 'auto', transform: 'none',
    transformOrigin: '', overflow: 'visible', overflowX: 'visible',
    overflowY: 'visible', cursor: 'auto', pointerEvents: 'auto',
    visibility: 'visible', boxSizing: 'border-box', transition: 'all 0s ease 0s',
    backdropFilter: 'none', filter: 'none', objectFit: 'fill',
    imageRendering: 'auto', userSelect: 'auto', textOverflow: 'clip',
    isolation: 'auto', mixBlendMode: 'normal', strokeWidth: '1px',
    fill: 'rgb(0, 0, 0)', stroke: 'none'
  };

  var colorUsage = {};    // "rgb(..)" -> [ "sel [prop]" ]
  var shadowUsage = {};
  var radiusUsage = {};
  var fontUsage = [];
  var seq = 0;

  function sel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var c = el.getAttribute('class');
    if (c) s += '.' + c.trim().split(/\\s+/).slice(0, 4).join('.');
    return s;
  }

  function note(bag, key, who) {
    if (!key) return;
    if (!bag[key]) bag[key] = [];
    if (bag[key].length < 24 && bag[key].indexOf(who) === -1) bag[key].push(who);
  }

  function ownText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return t.replace(/\\s+/g, ' ').trim();
  }

  function attrs(el) {
    var out = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name === 'class' || a.name === 'style') continue;
      out[a.name] = a.value.length > 200 ? a.value.slice(0, 200) + '\\u2026' : a.value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  function customProps(el) {
    var out = {};
    try {
      var map = el.computedStyleMap();
      var it = map.keys();
      var k = it.next();
      while (!k.done) {
        if (String(k.value).indexOf('--') === 0) {
          out[k.value] = String(map.get(k.value));
        }
        k = it.next();
      }
    } catch (e) { /* computedStyleMap unsupported */ }
    return Object.keys(out).length ? out : undefined;
  }

  function walk(el, depth, parentPath) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    var hidden = cs.display === 'none' || cs.visibility === 'hidden' ||
                 (r.width === 0 && r.height === 0 && el.children.length === 0);
    if (cs.display === 'none') return null;

    var path = parentPath + '/' + el.tagName.toLowerCase() + '[' + (seq++) + ']';
    var who = sel(el);

    var style = {};
    for (var i = 0; i < PROPS.length; i++) {
      var p = PROPS[i];
      var v = cs[p];
      if (v === undefined || v === null || v === '') continue;
      if (DEFAULTS.hasOwnProperty(p) && v === DEFAULTS[p]) continue;
      style[p] = v;
    }
    // always report the load-bearing ones even when default
    style.display = cs.display;
    style.position = cs.position;

    if (cs.color) note(colorUsage, cs.color, who + ' [color]');
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')
      note(colorUsage, cs.backgroundColor, who + ' [background-color]');
    if (cs.borderTopColor && cs.borderTopWidth !== '0px')
      note(colorUsage, cs.borderTopColor, who + ' [border]');
    if (cs.fill && cs.fill !== 'none' && el.namespaceURI && el.namespaceURI.indexOf('svg') > -1)
      note(colorUsage, cs.fill, who + ' [fill]');
    if (cs.stroke && cs.stroke !== 'none')
      note(colorUsage, cs.stroke, who + ' [stroke]');
    if (cs.boxShadow && cs.boxShadow !== 'none') note(shadowUsage, cs.boxShadow, who);
    if (cs.borderRadius && cs.borderRadius !== '0px') note(radiusUsage, cs.borderRadius, who);

    var text = ownText(el);
    if (text) {
      fontUsage.push({
        sel: who, text: text.slice(0, 60),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, color: cs.color,
        textTransform: cs.textTransform, fontVariationSettings: cs.fontVariationSettings
      });
    }

    var node = {
      path: path,
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: el.getAttribute('class') || undefined,
      attrs: attrs(el),
      text: text || undefined,
      hidden: hidden || undefined,
      box: {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
        exact: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
      },
      scroll: (el.scrollWidth !== Math.round(r.width) || el.scrollHeight !== Math.round(r.height))
        ? { w: el.scrollWidth, h: el.scrollHeight } : undefined,
      vars: customProps(el),
      style: style,
      children: []
    };

    if (el.tagName.toLowerCase() === 'svg') {
      node.svgOuterHTML = el.outerHTML;
      return node; // do not descend into svg internals for the tree
    }

    for (var j = 0; j < el.children.length; j++) {
      var kid = walk(el.children[j], depth + 1, path);
      if (kid) node.children.push(kid);
    }
    if (!node.children.length) delete node.children;
    return node;
  }

  var tree = walk(document.documentElement, 0, '');

  return {
    tree: tree,
    colorUsage: colorUsage,
    shadowUsage: shadowUsage,
    radiusUsage: radiusUsage,
    fontUsage: fontUsage,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }
  };
})()`

/* ------------------------------------------------------------------ */
/* 2. Icons                                                            */
/* ------------------------------------------------------------------ */

const ICONS = `(() => {
  function sel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var c = el.getAttribute('class');
    if (c) s += '.' + c.trim().split(/\\s+/).slice(0, 5).join('.');
    return s;
  }
  function boxOf(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             exact: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } };
  }

  var svgs = Array.prototype.slice.call(document.querySelectorAll('svg'));
  return svgs.map(function (svg, i) {
    var cs = getComputedStyle(svg);
    var host = svg.closest('button, a, [role="button"], label, input');
    var hostInfo = null;
    if (host) {
      var hcs = getComputedStyle(host);
      hostInfo = {
        tag: host.tagName.toLowerCase(),
        sel: sel(host),
        text: (host.textContent || '').replace(/\\s+/g, ' ').trim(),
        title: host.getAttribute('title') || host.getAttribute('aria-label') ||
               host.getAttribute('data-tooltip') || undefined,
        box: boxOf(host),
        background: hcs.backgroundColor,
        color: hcs.color,
        borderRadius: hcs.borderRadius,
        padding: hcs.padding,
        border: hcs.borderTopWidth !== '0px' ? hcs.borderTopWidth + ' ' + hcs.borderTopStyle + ' ' + hcs.borderTopColor : 'none',
        boxShadow: hcs.boxShadow,
        cursor: hcs.cursor,
        disabled: host.disabled === true || undefined
      };
    }

    // nearest titled ancestor for tooltip discovery
    var titled = svg.closest('[title],[aria-label],[data-state]');

    var shapes = Array.prototype.slice.call(svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse'))
      .map(function (s) {
        var o = { tag: s.tagName.toLowerCase() };
        for (var k = 0; k < s.attributes.length; k++) o[s.attributes[k].name] = s.attributes[k].value;
        return o;
      });

    return {
      index: i,
      box: boxOf(svg),
      viewBox: svg.getAttribute('viewBox'),
      widthAttr: svg.getAttribute('width'),
      heightAttr: svg.getAttribute('height'),
      classes: svg.getAttribute('class') || undefined,
      computed: {
        width: cs.width, height: cs.height, fill: cs.fill, stroke: cs.stroke,
        strokeWidth: cs.strokeWidth, color: cs.color, opacity: cs.opacity,
        strokeLinecap: cs.strokeLinecap, strokeLinejoin: cs.strokeLinejoin,
        overflow: cs.overflow, display: cs.display, flexShrink: cs.flexShrink
      },
      attrs: (function () {
        var o = {};
        for (var k = 0; k < svg.attributes.length; k++) o[svg.attributes[k].name] = svg.attributes[k].value;
        return o;
      })(),
      shapes: shapes,
      outerHTML: svg.outerHTML,
      host: hostInfo,
      nearestLabel: titled ? (titled.getAttribute('title') || titled.getAttribute('aria-label') || titled.getAttribute('data-state')) : undefined
    };
  });
})()`

/* ------------------------------------------------------------------ */
/* 3. Stylesheets / custom properties / fonts                          */
/* ------------------------------------------------------------------ */

const SHEETS = `(() => {
  var rootVars = {}, otherVarRules = [], allCss = [], keyframes = [], fontFaces = [];
  var sheets = Array.prototype.slice.call(document.styleSheets);
  var errors = [];

  for (var i = 0; i < sheets.length; i++) {
    var href = sheets[i].href || '(inline)';
    var rules;
    try { rules = Array.prototype.slice.call(sheets[i].cssRules); }
    catch (e) { errors.push({ href: href, error: String(e) }); continue; }

    (function scan(rules, media) {
      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.type === 5 /* FONT_FACE */ || (rule.constructor && rule.constructor.name === 'CSSFontFaceRule')) {
          fontFaces.push({ href: href, css: rule.cssText });
          continue;
        }
        if (rule.cssRules && !rule.selectorText) { // media / supports / layer
          scan(Array.prototype.slice.call(rule.cssRules), (rule.conditionText || rule.media && rule.media.mediaText || rule.name || ''));
          continue;
        }
        if (rule.selectorText) {
          var vars = {};
          for (var k = 0; k < rule.style.length; k++) {
            var prop = rule.style[k];
            if (prop.indexOf('--') === 0) vars[prop] = rule.style.getPropertyValue(prop).trim();
          }
          if (Object.keys(vars).length) {
            if (/^(:root|html|\\*|:host)/.test(rule.selectorText.trim())) {
              for (var v in vars) rootVars[v] = vars[v];
            }
            otherVarRules.push({ href: href, media: media || undefined, selector: rule.selectorText, vars: vars });
          }
          allCss.push({ href: href, media: media || undefined, selector: rule.selectorText, css: rule.cssText.length > 4000 ? rule.cssText.slice(0, 4000) + '/*…*/' : rule.cssText });
        }
      }
    })(rules, '');
  }

  var loadedFonts = [];
  try {
    document.fonts.forEach(function (f) {
      loadedFonts.push({ family: f.family, weight: f.weight, style: f.style, status: f.status, unicodeRange: f.unicodeRange, src: (f.src || '').slice(0, 300) });
    });
  } catch (e) {}

  var links = Array.prototype.slice.call(document.querySelectorAll('link')).map(function (l) {
    return { rel: l.rel, href: l.href, as: l.getAttribute('as') || undefined, type: l.type || undefined };
  });

  return { rootVars: rootVars, otherVarRules: otherVarRules, fontFaces: fontFaces,
           loadedFonts: loadedFonts, links: links, errors: errors,
           ruleCount: allCss.length, allCss: allCss };
})()`

/* ------------------------------------------------------------------ */
/* 4. Canvas                                                           */
/* ------------------------------------------------------------------ */

const CANVAS = `(() => {
  function hex(r, g, b, a) {
    function h(n) { return ('0' + n.toString(16)).slice(-2); }
    return '#' + h(r) + h(g) + h(b) + (a === 255 ? '' : h(a));
  }

  var out = [];
  var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas'));

  canvases.forEach(function (c, idx) {
    var r = c.getBoundingClientRect();
    var cs = getComputedStyle(c);
    var info = {
      index: idx,
      id: c.id || undefined,
      classes: c.getAttribute('class') || undefined,
      attrWidth: c.width, attrHeight: c.height,
      cssWidth: +r.width.toFixed(2), cssHeight: +r.height.toFixed(2),
      cssX: +r.x.toFixed(2), cssY: +r.y.toFixed(2),
      devicePixelRatio: window.devicePixelRatio,
      backingScaleX: +(c.width / r.width).toFixed(4),
      backingScaleY: +(c.height / r.height).toFixed(4),
      style: {
        position: cs.position, top: cs.top, left: cs.left, zIndex: cs.zIndex,
        display: cs.display, imageRendering: cs.imageRendering, cursor: cs.cursor,
        touchAction: cs.touchAction, background: cs.backgroundColor,
        width: cs.width, height: cs.height, transform: cs.transform
      },
      contextType: null
    };

    var ctx = null;
    try { ctx = c.getContext('2d', { willReadFrequently: true }); } catch (e) {}
    if (ctx) {
      info.contextType = '2d';
      try {
        var t = ctx.getTransform();
        info.currentTransform = { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
      } catch (e) {}
    } else {
      var gl = null;
      try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) {}
      info.contextType = gl ? 'webgl' : 'unknown (getContext returned null for 2d and webgl)';
    }

    if (info.contextType !== '2d') { out.push(info); return; }

    var W = c.width, H = c.height, S = c.width / r.width;

    function rle(getPx, len, limit) {
      var runs = [], cur = null;
      for (var i = 0; i < len; i++) {
        var p = getPx(i);
        var key = p[0] + ',' + p[1] + ',' + p[2] + ',' + p[3];
        if (cur && cur.key === key) { cur.len++; }
        else { cur = { key: key, hex: hex(p[0], p[1], p[2], p[3]), start: i, len: 1 }; runs.push(cur); }
      }
      return runs.slice(0, limit || 4000).map(function (x) {
        return { hex: x.hex, startDev: x.start, lenDev: x.len,
                 startCss: +(x.start / S).toFixed(2), lenCss: +(x.len / S).toFixed(2) };
      });
    }

    // ---- horizontal scanline through the vertical centre
    var yMid = Math.floor(H / 2);
    var rowData = ctx.getImageData(0, yMid, W, 1).data;
    var hRuns = rle(function (i) { return [rowData[i*4], rowData[i*4+1], rowData[i*4+2], rowData[i*4+3]]; }, W);

    // ---- vertical scanline through the horizontal centre
    var xMid = Math.floor(W / 2);
    var colData = ctx.getImageData(xMid, 0, 1, H).data;
    var vRuns = rle(function (i) { return [colData[i*4], colData[i*4+1], colData[i*4+2], colData[i*4+3]]; }, H);

    info.scanlines = {
      horizontalAtDeviceY: yMid,
      horizontalRuns: hRuns,
      verticalAtDeviceX: xMid,
      verticalRuns: vRuns
    };

    // ---- global colour histogram (sampled every 4th device px)
    var hist = {};
    var step = 4;
    var big = ctx.getImageData(0, 0, W, H).data;
    for (var y = 0; y < H; y += step) {
      for (var x = 0; x < W; x += step) {
        var o = (y * W + x) * 4;
        var k = hex(big[o], big[o+1], big[o+2], big[o+3]);
        hist[k] = (hist[k] || 0) + 1;
      }
    }
    var total = 0; for (var kk in hist) total += hist[kk];
    info.colorHistogram = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; })
      .slice(0, 40).map(function (k) { return { hex: k, samples: hist[k], pct: +(100 * hist[k] / total).toFixed(3) }; });

    // ---- artwork bounds: first/last device px on the mid scanlines that is not the page background
    var bgKey = hex(big[0], big[1], big[2], big[3]); // top-left device pixel
    info.topLeftPixel = bgKey;

    function bounds(runs) {
      var first = null, last = null;
      for (var i = 0; i < runs.length; i++) {
        if (runs[i].hex !== bgKey) { if (first === null) first = runs[i].startDev; last = runs[i].startDev + runs[i].lenDev; }
      }
      return first === null ? null : { startDev: first, endDev: last,
        startCss: +(first / S).toFixed(2), endCss: +(last / S).toFixed(2),
        sizeCss: +((last - first) / S).toFixed(2), sizeDev: last - first };
    }
    info.artworkBoundsFromScanlines = { horizontal: bounds(hRuns), vertical: bounds(vRuns) };

    // ---- ASCII map of a 48x48 device-px block at the artwork top-left
    var hb = info.artworkBoundsFromScanlines.horizontal, vb = info.artworkBoundsFromScanlines.vertical;
    if (hb && vb) {
      var x0 = Math.max(0, hb.startDev - 4), y0 = Math.max(0, vb.startDev - 4);
      var n = 56;
      var blk = ctx.getImageData(x0, y0, n, n).data;
      var legend = {}, order = [], rows = [];
      var syms = '.#*+=o~-^%$&@!?<>ABCDEFGH';
      for (var yy = 0; yy < n; yy++) {
        var line = '';
        for (var xx = 0; xx < n; xx++) {
          var oo = (yy * n + xx) * 4;
          var kx = hex(blk[oo], blk[oo+1], blk[oo+2], blk[oo+3]);
          if (!(kx in legend)) { legend[kx] = syms[order.length] || '?'; order.push(kx); }
          line += legend[kx];
        }
        rows.push(line);
      }
      info.topLeftAscii = { originDev: { x: x0, y: y0 }, sizeDev: n, scale: S,
        legend: order.map(function (k) { return { sym: legend[k], hex: k }; }), rows: rows };
    }

    out.push(info);
  });

  return out;
})()`

/* ------------------------------------------------------------------ */
/* 5. Geometry-only capture (for the responsive pass)                  */
/* ------------------------------------------------------------------ */

const GEOMETRY = `(() => {
  function sel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var c = el.getAttribute('class');
    if (c) s += '.' + c.trim().split(/\\s+/).slice(0, 4).join('.');
    return s;
  }
  var out = [];
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({
      sel: sel(el),
      tag: el.tagName.toLowerCase(),
      text: (el.children.length === 0 ? (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) : '') || undefined,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      position: cs.position, display: cs.display, zIndex: cs.zIndex !== 'auto' ? cs.zIndex : undefined,
      fontSize: cs.fontSize, background: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : undefined,
      radius: cs.borderRadius !== '0px' ? cs.borderRadius : undefined
    });
  }
  var hiddenish = Array.prototype.slice.call(document.querySelectorAll('*')).filter(function (el) {
    var cs = getComputedStyle(el);
    return cs.display === 'none';
  }).map(function (el) { return sel(el); }).slice(0, 200);

  return { viewport: { w: window.innerWidth, h: window.innerHeight },
           elements: out, displayNone: hiddenish,
           bodyText: (document.body.innerText || '').trim() };
})()`

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const SNAPSHOT_ONE = (selectorJson: string) => `(() => {
  var el = document.querySelector(${selectorJson});
  if (!el) return null;
  var cs = getComputedStyle(el);
  var r = el.getBoundingClientRect();
  var o = { box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  for (var i = 0; i < cs.length; i++) { o[cs[i]] = cs.getPropertyValue(cs[i]); }
  var svg = el.querySelector('svg');
  if (svg) {
    var scs = getComputedStyle(svg);
    o['__svg_stroke'] = scs.stroke; o['__svg_fill'] = scs.fill;
    o['__svg_color'] = scs.color; o['__svg_opacity'] = scs.opacity;
    o['__svg_strokeWidth'] = scs.strokeWidth;
  }
  return o;
})()`

function diffStyles(a: Record<string, string>, b: Record<string, string>) {
  const d: Record<string, { from: string; to: string }> = {}
  for (const k of Object.keys(b)) {
    if (k === 'box') continue
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b[k])) d[k] = { from: a?.[k] as string, to: b[k] }
  }
  return d
}

async function settle(page: Page) {
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60_000 })
  } catch {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await page.waitForTimeout(5000)
}

/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  const network: Array<Record<string, unknown>> = []

  /* ===== primary pass: 1440x900 @ dsf 2 ===== */
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  page.on('response', (res) => {
    network.push({
      status: res.status(),
      type: res.request().resourceType(),
      url: res.url(),
      contentType: res.headers()['content-type'],
      size: res.headers()['content-length'],
    })
  })

  console.log('-> primary 1440x900')
  await settle(page)

  await page.screenshot({ path: join(SHOTS, 'full-1440x900.png') })
  await page.screenshot({ path: join(SHOTS, 'full-1440x900-fullpage.png'), fullPage: true })

  console.log('   dom tree…')
  const tree = await page.evaluate(TREE)
  console.log('   icons…')
  const icons = await page.evaluate(ICONS)
  console.log('   stylesheets…')
  const sheets = await page.evaluate(SHEETS)
  console.log('   canvas…')
  const canvas = await page.evaluate(CANVAS)

  writeFileSync(join(OUT, 'dom-tree.json'), JSON.stringify(tree, null, 2), 'utf8')
  writeFileSync(join(OUT, 'icons.json'), JSON.stringify(icons, null, 2), 'utf8')
  writeFileSync(join(OUT, 'stylesheets.json'), JSON.stringify(sheets, null, 2), 'utf8')
  writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf8')

  /* ===== region screenshots ===== */
  const regions: Record<string, { x: number; y: number; width: number; height: number }> = {
    'topbar': { x: 0, y: 0, width: 1440, height: 60 },
    'topbar-left': { x: 0, y: 0, width: 620, height: 60 },
    'topbar-right': { x: 1040, y: 0, width: 400, height: 60 },
    'toolrail': { x: 0, y: 260, width: 120, height: 420 },
    'composer': { x: 0, y: 820, width: 380, height: 80 },
    'zoom': { x: 1270, y: 830, width: 170, height: 70 },
  }
  for (const [name, clip] of Object.entries(regions)) {
    try {
      await page.screenshot({ path: join(SHOTS, `region-${name}.png`), clip })
    } catch (e) {
      console.warn(`   region ${name} failed: ${String(e)}`)
    }
  }

  /* ===== hover states ===== */
  console.log('   hover states…')
  const hoverReport: Record<string, unknown> = {}

  const hoverProbe = await page.evaluate(`(() => {
    function sel(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      var parts = [];
      var cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 6) {
        var p = cur.tagName.toLowerCase();
        var parent = cur.parentElement;
        if (parent) {
          var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === cur.tagName; });
          if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
        }
        parts.unshift(p);
        if (cur.id) { parts[0] = '#' + CSS.escape(cur.id); break; }
        cur = parent;
      }
      return parts.join(' > ');
    }
    var btns = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], a'));
    return btns.map(function (b) {
      var r = b.getBoundingClientRect();
      return { sel: sel(b), text: (b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30),
               x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               hasSvg: !!b.querySelector('svg') };
    }).filter(function (b) { return b.w > 0 && b.h > 0; });
  })()`) as Array<{ sel: string; text: string; x: number; y: number; w: number; h: number; hasSvg: boolean }>

  writeFileSync(join(OUT, 'buttons.json'), JSON.stringify(hoverProbe, null, 2), 'utf8')

  // pick: a tool-rail button (x < 120, y between 300 and 950), a top-bar icon button (y < 60, x > 1000),
  // and a top-bar left control.
  const pick = (pred: (b: typeof hoverProbe[number]) => boolean) => hoverProbe.find(pred)
  const candidates = [
    { label: 'toolrail-inactive', b: pick((b) => b.x < 130 && b.y > 300 && b.y < 950 && b.hasSvg) },
    { label: 'toolrail-second', b: hoverProbe.filter((b) => b.x < 130 && b.y > 300 && b.y < 950 && b.hasSvg)[2] },
    { label: 'topbar-right-icon', b: pick((b) => b.y < 60 && b.x > 1100 && b.hasSvg) },
    { label: 'topbar-left-icon', b: pick((b) => b.y < 60 && b.x > 120 && b.x < 300 && b.hasSvg) },
    { label: 'zoom-plus', b: pick((b) => b.y > 800 && b.x > 1200 && b.hasSvg) },
    { label: 'composer-send', b: pick((b) => b.y > 800 && b.x < 500 && b.hasSvg) },
  ]

  for (const c of candidates) {
    if (!c.b) { hoverReport[c.label] = { error: 'no candidate found' }; continue }
    try {
      const before = await page.evaluate(SNAPSHOT_ONE(JSON.stringify(c.b.sel))) as Record<string, string>
      await page.mouse.move(c.b.x + c.b.w / 2, c.b.y + c.b.h / 2)
      await page.waitForTimeout(500)
      const after = await page.evaluate(SNAPSHOT_ONE(JSON.stringify(c.b.sel))) as Record<string, string>
      await page.screenshot({
        path: join(SHOTS, `hover-${c.label}.png`),
        clip: { x: Math.max(0, c.b.x - 24), y: Math.max(0, c.b.y - 24), width: c.b.w + 48, height: c.b.h + 48 },
      })
      hoverReport[c.label] = { target: c.b, changed: diffStyles(before, after) }
      // move away and let it reset
      await page.mouse.move(720, 450)
      await page.waitForTimeout(400)
    } catch (e) {
      hoverReport[c.label] = { target: c.b, error: String(e) }
    }
  }

  /* ===== focus-visible ===== */
  console.log('   focus-visible…')
  try {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)
    const f1 = await page.evaluate(`(() => {
      var el = document.activeElement;
      if (!el || el === document.body) return null;
      var cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class'),
        text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        outline: cs.outline, outlineOffset: cs.outlineOffset, outlineColor: cs.outlineColor,
        outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle,
        boxShadow: cs.boxShadow, border: cs.border, background: cs.backgroundColor,
        matchesFocusVisible: (function(){ try { return el.matches(':focus-visible'); } catch(e){ return null; } })()
      };
    })()`)
    hoverReport['focusVisible_firstTab'] = f1
    await page.screenshot({ path: join(SHOTS, 'focus-visible-1.png') })

    await page.keyboard.press('Tab')
    await page.waitForTimeout(250)
    hoverReport['focusVisible_secondTab'] = await page.evaluate(`(() => {
      var el = document.activeElement;
      if (!el || el === document.body) return null;
      var cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), cls: el.getAttribute('class'),
        text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow };
    })()`)
    await page.screenshot({ path: join(SHOTS, 'focus-visible-2.png') })
  } catch (e) {
    hoverReport['focusVisible'] = { error: String(e) }
  }

  writeFileSync(join(OUT, 'interaction.json'), JSON.stringify(hoverReport, null, 2), 'utf8')
  await ctx.close()

  /* ===== canvas crop @ dsf 3 ===== */
  console.log('-> canvas crops @ dsf 3')
  const ctx3 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 3,
    colorScheme: 'light',
  })
  const p3 = await ctx3.newPage()
  await settle(p3)

  const art = await p3.evaluate(`(() => {
    var c = document.querySelector('canvas');
    if (!c) return null;
    var ctx = null;
    try { ctx = c.getContext('2d', { willReadFrequently: true }); } catch (e) {}
    var r = c.getBoundingClientRect();
    if (!ctx) return { canvasBox: { x: r.x, y: r.y, w: r.width, h: r.height }, art: null };
    var W = c.width, H = c.height, S = c.width / r.width;
    var big = ctx.getImageData(0, 0, W, H).data;
    function key(o) { return big[o] + ',' + big[o+1] + ',' + big[o+2] + ',' + big[o+3]; }
    var bg = key(0);
    var minX = W, minY = H, maxX = -1, maxY = -1;
    for (var y = 0; y < H; y += 2) {
      for (var x = 0; x < W; x += 2) {
        var o = (y * W + x) * 4;
        if (key(o) !== bg) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { canvasBox: { x: r.x, y: r.y, w: r.width, h: r.height }, art: null };
    return {
      canvasBox: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      scale: S,
      artDev: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      artCss: { x: +(r.x + minX / S).toFixed(2), y: +(r.y + minY / S).toFixed(2),
                w: +((maxX - minX + 1) / S).toFixed(2), h: +((maxY - minY + 1) / S).toFixed(2) }
    };
  })()`) as any

  writeFileSync(join(OUT, 'canvas-artwork-bounds.json'), JSON.stringify(art, null, 2), 'utf8')

  if (art && art.artCss) {
    const ax = Math.round(art.artCss.x), ay = Math.round(art.artCss.y)
    const crops: Array<[string, { x: number; y: number; width: number; height: number }]> = [
      ['canvas-artwork-topleft-200', { x: Math.max(0, ax - 20), y: Math.max(0, ay - 20), width: 200, height: 200 }],
      ['canvas-artwork-topleft-60', { x: Math.max(0, ax - 6), y: Math.max(0, ay - 6), width: 60, height: 60 }],
      ['canvas-artwork-center-120', { x: Math.round(art.artCss.x + art.artCss.w / 2 - 60), y: Math.round(art.artCss.y + art.artCss.h / 2 - 60), width: 120, height: 120 }],
      ['canvas-artwork-bottomright-200', { x: Math.round(art.artCss.x + art.artCss.w - 180), y: Math.round(art.artCss.y + art.artCss.h - 180), width: 200, height: 200 }],
      ['canvas-outside-200', { x: 200, y: 200, width: 200, height: 200 }],
    ]
    for (const [name, clip] of crops) {
      try { await p3.screenshot({ path: join(SHOTS, `${name}.png`), clip }) }
      catch (e) { console.warn(`   crop ${name} failed: ${String(e)}`) }
    }
  }
  await ctx3.close()

  /* ===== responsive geometry ===== */
  console.log('-> responsive geometry')
  const responsive: Record<string, unknown> = {}
  for (const vp of VIEWPORTS) {
    const c = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      isMobile: vp.width < 500,
      hasTouch: vp.width < 500,
    })
    const p = await c.newPage()
    console.log(`   ${vp.name}`)
    await settle(p)
    await p.screenshot({ path: join(SHOTS, `bp-${vp.name}.png`) })
    try {
      responsive[vp.name] = await p.evaluate(GEOMETRY)
      const cvs = await p.evaluate(`(() => {
        var c = document.querySelector('canvas');
        if (!c) return null;
        var r = c.getBoundingClientRect();
        return { attrW: c.width, attrH: c.height, cssW: +r.width.toFixed(2), cssH: +r.height.toFixed(2),
                 x: +r.x.toFixed(2), y: +r.y.toFixed(2), dpr: window.devicePixelRatio };
      })()`)
      ;(responsive[vp.name] as Record<string, unknown>).canvas = cvs
      const iconCount = await p.evaluate(`document.querySelectorAll('svg').length`)
      ;(responsive[vp.name] as Record<string, unknown>).svgCount = iconCount
    } catch (e) {
      responsive[vp.name] = { error: String(e) }
    }
    await c.close()
  }
  writeFileSync(join(OUT, 'responsive.json'), JSON.stringify(responsive, null, 2), 'utf8')

  writeFileSync(join(OUT, 'network.json'), JSON.stringify(network, null, 2), 'utf8')

  await browser.close()
  console.log('\ndone -> ' + OUT)
}

main().catch((e) => { console.error(e); process.exit(1) })
