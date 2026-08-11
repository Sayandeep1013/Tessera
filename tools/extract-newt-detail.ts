/**
 * Second extraction pass against https://newt.sh/ (public page only).
 *
 *  - full nested DOM/style tree at 390x844 (the mobile layout is a different
 *    component tree, not a reflow of the desktop one)
 *  - mobile icon inventory
 *  - high-precision canvas probe: every edge, many scanlines, grid pitch,
 *    major-line detection, artwork logical size
 *
 *   npx tsx tools/extract-newt-detail.ts
 *
 * Browser-side payloads are plain STRINGS (tsx/esbuild keepNames would inject
 * a `__name` helper that does not exist inside page.evaluate).
 */

import { chromium, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'https://newt.sh/'
const OUT = join(process.cwd(), 'docs', 'research', 'newt')
const SHOTS = join(OUT, 'shots')

const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth',
  'margin', 'padding', 'gap', 'flexDirection', 'flexWrap', 'alignItems',
  'justifyContent', 'flex', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'backgroundImage',
  'borderTop', 'borderBottom', 'borderRadius', 'boxShadow', 'opacity',
  'zIndex', 'transform', 'overflow', 'overflowX', 'cursor', 'pointerEvents',
  'backdropFilter', 'fill', 'whiteSpace', 'textOverflow', 'scrollbarWidth',
]

const TREE = `(() => {
  var PROPS = ${JSON.stringify(STYLE_PROPS)};
  var DEF = { top:'auto',right:'auto',bottom:'auto',left:'auto',minWidth:'0px',minHeight:'0px',
    maxWidth:'none',margin:'0px',padding:'0px',gap:'normal',flexDirection:'row',flexWrap:'nowrap',
    alignItems:'normal',justifyContent:'normal',flex:'0 1 auto',letterSpacing:'normal',
    backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',borderRadius:'0px',boxShadow:'none',
    opacity:'1',zIndex:'auto',transform:'none',overflow:'visible',overflowX:'visible',cursor:'auto',
    pointerEvents:'auto',backdropFilter:'none',whiteSpace:'normal',textOverflow:'clip',
    scrollbarWidth:'auto',borderTop:'0px solid rgb(0, 0, 0)',borderBottom:'0px solid rgb(0, 0, 0)' };
  var seq = 0;
  function ownText(el){var t='';for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];if(n.nodeType===3)t+=n.nodeValue;}return t.replace(/\\s+/g,' ').trim();}
  function attrs(el){var o={};for(var i=0;i<el.attributes.length;i++){var a=el.attributes[i];if(a.name==='class'||a.name==='style')continue;o[a.name]=a.value.slice(0,200);}return Object.keys(o).length?o:undefined;}
  function walk(el){
    var cs=getComputedStyle(el); if(cs.display==='none') return null;
    var r=el.getBoundingClientRect();
    var st={}; for(var i=0;i<PROPS.length;i++){var p=PROPS[i],v=cs[p];
      if(v===undefined||v===null||v==='')continue;
      if(DEF.hasOwnProperty(p)&&v===DEF[p])continue; st[p]=v; }
    st.display=cs.display; st.position=cs.position;
    var node={ seq:seq++, tag:el.tagName.toLowerCase(), id:el.id||undefined,
      classes:el.getAttribute('class')||undefined, attrs:attrs(el), text:ownText(el)||undefined,
      box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
           exact:{x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)}},
      scroll:(el.scrollWidth!==Math.round(r.width)||el.scrollHeight!==Math.round(r.height))?{w:el.scrollWidth,h:el.scrollHeight}:undefined,
      style:st, children:[] };
    if(el.tagName.toLowerCase()==='svg'){ node.svgOuterHTML=el.outerHTML; return node; }
    for(var j=0;j<el.children.length;j++){var k=walk(el.children[j]); if(k)node.children.push(k);}
    if(!node.children.length) delete node.children;
    return node;
  }
  return { tree: walk(document.documentElement),
           viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio} };
})()`

const ICONS = `(() => {
  function boxOf(el){var r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}
  return Array.prototype.slice.call(document.querySelectorAll('svg')).map(function(svg,i){
    var cs=getComputedStyle(svg);
    var host=svg.closest('button, a, [role="button"], label');
    var hcs=host?getComputedStyle(host):null;
    return { index:i, box:boxOf(svg), viewBox:svg.getAttribute('viewBox'),
      classes:svg.getAttribute('class')||undefined,
      computed:{width:cs.width,height:cs.height,fill:cs.fill,stroke:cs.stroke,strokeWidth:cs.strokeWidth,color:cs.color,opacity:cs.opacity},
      outerHTML:svg.outerHTML,
      host: host?{ tag:host.tagName.toLowerCase(),
        title:host.getAttribute('title')||host.getAttribute('aria-label')||undefined,
        pressed:host.getAttribute('aria-pressed')||undefined,
        disabled:host.disabled===true||undefined,
        text:(host.textContent||'').replace(/\\s+/g,' ').trim()||undefined,
        box:boxOf(host), background:hcs.backgroundColor, color:hcs.color,
        borderRadius:hcs.borderRadius, boxShadow:hcs.boxShadow, opacity:hcs.opacity }:undefined };
  });
})()`

/* Very precise canvas probe. */
const PROBE = `(() => {
  function hex(r,g,b,a){function h(n){return ('0'+n.toString(16)).slice(-2);}return '#'+h(r)+h(g)+h(b)+(a===255?'':h(a));}
  var c=document.querySelector('canvas'); if(!c) return {error:'no canvas'};
  var ctx=null; try{ctx=c.getContext('2d',{willReadFrequently:true});}catch(e){}
  if(!ctx) return {error:'canvas has no 2d context'};
  var r=c.getBoundingClientRect(), W=c.width, H=c.height, S=W/r.width;
  var d=ctx.getImageData(0,0,W,H).data;
  function px(x,y){var o=(y*W+x)*4;return hex(d[o],d[o+1],d[o+2],d[o+3]);}
  function raw(x,y){var o=(y*W+x)*4;return [d[o],d[o+1],d[o+2],d[o+3]];}

  var bg = px(0,0);

  // exact artwork bounding box (1px scan, not sampled)
  var minX=W,minY=H,maxX=-1,maxY=-1;
  for(var y=0;y<H;y++){ for(var x=0;x<W;x++){ if(px(x,y)!==bg){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } } }
  var box={minX:minX,minY:minY,maxX:maxX,maxY:maxY,wDev:maxX-minX+1,hDev:maxY-minY+1};

  // edge colour probes: walk inward from each edge along the middle
  function inward(fromX,fromY,dx,dy,n){ var out=[]; for(var i=0;i<n;i++){ var x=fromX+dx*i,y=fromY+dy*i;
    if(x<0||y<0||x>=W||y>=H) break; out.push({i:i,devX:x,devY:y,hex:px(x,y),rgba:raw(x,y)}); } return out; }
  var midY=Math.round((minY+maxY)/2), midX=Math.round((minX+maxX)/2);
  var edges = {
    left:   inward(minX-2, midY, 1, 0, 12),
    right:  inward(maxX+2, midY, -1, 0, 12),
    top:    inward(midX, minY-2, 0, 1, 12),
    bottom: inward(midX, maxY+2, 0, -1, 12)
  };

  // corner blocks (8x8 device px) as ascii
  function ascii(x0,y0,n){ var legend={},order=[],rows=[],syms='.#*+=o~-^%$&@';
    for(var yy=0;yy<n;yy++){ var line=''; for(var xx=0;xx<n;xx++){ var k=px(x0+xx,y0+yy);
      if(!(k in legend)){legend[k]=syms[order.length]||'?';order.push(k);} line+=legend[k]; } rows.push(line); }
    return {origin:{x:x0,y:y0},legend:order.map(function(k){return{sym:legend[k],hex:k};}),rows:rows}; }
  var corners = {
    topLeft: ascii(minX-3,minY-3,14),
    topRight: ascii(maxX-10,minY-3,14),
    bottomLeft: ascii(minX-3,maxY-10,14),
    bottomRight: ascii(maxX-10,maxY-10,14)
  };

  // grid pitch: positions of every non-white run along a scanline inside the artwork
  var gy = minY + 6;
  var lines=[]; var prevWasLine=false;
  for(var x=minX;x<=maxX;x++){ var k=px(x,gy); var isLine = (k!=='#ffffff');
    if(isLine && !prevWasLine) lines.push({devX:x,hex:k,cssX:+((x)/S).toFixed(2)});
    prevWasLine=isLine; }
  var pitches=[]; for(var i=1;i<lines.length;i++) pitches.push(lines[i].devX-lines[i-1].devX);
  var pitchCounts={}; pitches.forEach(function(p){pitchCounts[p]=(pitchCounts[p]||0)+1;});
  var lineHexCounts={}; lines.forEach(function(l){lineHexCounts[l.hex]=(lineHexCounts[l.hex]||0)+1;});

  // same vertically
  var gx = minX + 6;
  var vlines=[]; prevWasLine=false;
  for(var y=minY;y<=maxY;y++){ var k2=px(gx,y); var isL=(k2!=='#ffffff');
    if(isL&&!prevWasLine) vlines.push({devY:y,hex:k2,cssY:+((y)/S).toFixed(2)});
    prevWasLine=isL; }
  var vpitches=[]; for(var i2=1;i2<vlines.length;i2++) vpitches.push(vlines[i2].devY-vlines[i2-1].devY);
  var vpitchCounts={}; vpitches.forEach(function(p){vpitchCounts[p]=(vpitchCounts[p]||0)+1;});

  // width of each grid line, in device px, measured on the same scanline
  var widths={};
  for(var i3=0;i3<lines.length;i3++){ var w=0,xx2=lines[i3].devX;
    while(xx2<=maxX && px(xx2,gy)!=='#ffffff'){w++;xx2++;} widths[w]=(widths[w]||0)+1; }

  // distinct colours in the whole canvas (exact, every pixel)
  var histo={};
  for(var y3=0;y3<H;y3++){ for(var x3=0;x3<W;x3++){ var k3=px(x3,y3); histo[k3]=(histo[k3]||0)+1; } }

  return {
    canvasAttr:{w:W,h:H}, canvasCss:{x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)},
    dpr:window.devicePixelRatio, backingScale:S, pageBackgroundInsideCanvas:bg,
    artworkDev:box,
    artworkCssPage:{ x:+(r.x+minX/S).toFixed(3), y:+(r.y+minY/S).toFixed(3),
                     w:+(box.wDev/S).toFixed(3), h:+(box.hDev/S).toFixed(3) },
    edges:edges, corners:corners,
    horizontalGridLines:{count:lines.length, first:lines[0], last:lines[lines.length-1],
      pitchDevCounts:pitchCounts, colourCounts:lineHexCounts, lineWidthDevCounts:widths,
      allCssX:lines.map(function(l){return +(r.x+l.devX/S).toFixed(2);})},
    verticalGridLines:{count:vlines.length, first:vlines[0], last:vlines[vlines.length-1],
      pitchDevCounts:vpitchCounts,
      allCssY:vlines.map(function(l){return +(r.y+l.devY/S).toFixed(2);})},
    exactHistogram: Object.keys(histo).sort(function(a,b){return histo[b]-histo[a];})
      .map(function(k){return {hex:k, pixels:histo[k], pct:+(100*histo[k]/(W*H)).toFixed(4)};})
  };
})()`

async function settle(page: Page) {
  try { await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60_000 }) }
  catch { await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 }) }
  await page.waitForTimeout(5000)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()

  /* ---- mobile tree ---- */
  console.log('-> mobile 390x844')
  const m = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, colorScheme: 'light',
  })
  const mp = await m.newPage()
  await settle(mp)
  writeFileSync(join(OUT, 'dom-tree-390.json'), JSON.stringify(await mp.evaluate(TREE), null, 2), 'utf8')
  writeFileSync(join(OUT, 'icons-390.json'), JSON.stringify(await mp.evaluate(ICONS), null, 2), 'utf8')
  const mProbe = await mp.evaluate(PROBE) as any
  writeFileSync(join(OUT, 'canvas-probe-390.json'), JSON.stringify(mProbe, null, 2), 'utf8')
  await mp.screenshot({ path: join(SHOTS, 'bp-390x844-dsf3.png') })
  if (mProbe && mProbe.artworkCssPage) {
    const a = mProbe.artworkCssPage
    await mp.screenshot({
      path: join(SHOTS, 'canvas-390-topleft-120.png'),
      clip: { x: Math.max(0, Math.round(a.x) - 12), y: Math.max(0, Math.round(a.y) - 12), width: 120, height: 120 },
    })
  }
  await m.close()

  /* ---- desktop precise canvas probe @ dsf 2 and dsf 3 ---- */
  for (const dsf of [2, 3]) {
    console.log(`-> desktop probe dsf ${dsf}`)
    const c = await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: dsf, colorScheme: 'light',
    })
    const p = await c.newPage()
    await settle(p)
    const probe = await p.evaluate(PROBE) as any
    writeFileSync(join(OUT, `canvas-probe-1440-dsf${dsf}.json`), JSON.stringify(probe, null, 2), 'utf8')

    if (dsf === 3 && probe && probe.artworkCssPage) {
      const a = probe.artworkCssPage
      const crops: Array<[string, { x: number; y: number; width: number; height: number }]> = [
        ['canvas-corner-topleft-200-dsf3', { x: Math.round(a.x) - 20, y: Math.round(a.y) - 20, width: 200, height: 200 }],
        ['canvas-corner-topleft-40-dsf3', { x: Math.round(a.x) - 4, y: Math.round(a.y) - 4, width: 40, height: 40 }],
        ['canvas-corner-bottomright-200-dsf3', { x: Math.round(a.x + a.w) - 180, y: Math.round(a.y + a.h) - 180, width: 200, height: 200 }],
        ['canvas-grid-mid-200-dsf3', { x: Math.round(a.x + a.w / 2 - 100), y: Math.round(a.y + a.h / 2 - 100), width: 200, height: 200 }],
      ]
      for (const [name, clip] of crops) {
        try { await p.screenshot({ path: join(SHOTS, `${name}.png`), clip }) }
        catch (e) { console.warn(`   ${name}: ${String(e)}`) }
      }
    }
    await c.close()
  }

  await browser.close()
  console.log('\ndone -> ' + OUT)
}

main().catch((e) => { console.error(e); process.exit(1) })
