/**
 * Canvas geometry probe across every breakpoint (public page only).
 *   npx tsx tools/probe-newt-canvas-bp.ts
 * Browser payload is a plain STRING (tsx/esbuild keepNames + page.evaluate).
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'https://newt.sh/'
const OUT = join(process.cwd(), 'docs', 'research', 'newt')

const VPS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
]

const PROBE = `(() => {
  function hex(r,g,b,a){function h(n){return ('0'+n.toString(16)).slice(-2);}return '#'+h(r)+h(g)+h(b)+(a===255?'':h(a));}
  var c=document.querySelector('canvas'); if(!c) return {error:'no canvas'};
  var ctx=null; try{ctx=c.getContext('2d',{willReadFrequently:true});}catch(e){}
  if(!ctx) return {error:'no 2d context'};
  var r=c.getBoundingClientRect(), W=c.width, H=c.height, S=W/r.width;
  var d=ctx.getImageData(0,0,W,H).data;
  function px(x,y){var o=(y*W+x)*4;return hex(d[o],d[o+1],d[o+2],d[o+3]);}
  var bg=px(0,0), minX=W,minY=H,maxX=-1,maxY=-1;
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){ if(px(x,y)!==bg){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
  // grid pitch on a scanline 6 device px inside the top edge
  var gy=minY+6, lines=[], prev=false;
  for(var x2=minX;x2<=maxX;x2++){ var isL=px(x2,gy)!=='#ffffff'; if(isL&&!prev)lines.push(x2); prev=isL; }
  var pitch={}; for(var i=1;i<lines.length;i++){var p=lines[i]-lines[i-1]; pitch[p]=(pitch[p]||0)+1;}
  var zoomEl=document.querySelector('button.min-w-12');
  var histo={}; for(var y4=0;y4<H;y4++)for(var x4=0;x4<W;x4++){var k=px(x4,y4);histo[k]=(histo[k]||0)+1;}
  return {
    viewport:{w:window.innerWidth,h:window.innerHeight}, dpr:window.devicePixelRatio,
    canvasAttr:{w:W,h:H}, canvasCss:{x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)},
    outerCssPage:{ x:+(r.x+minX/S).toFixed(2), y:+(r.y+minY/S).toFixed(2),
                   w:+((maxX-minX+1)/S).toFixed(2), h:+((maxY-minY+1)/S).toFixed(2) },
    contentCssPage:{ x:+(r.x+(minX+S)/S).toFixed(2), y:+(r.y+(minY+S)/S).toFixed(2),
                     w:+((maxX-minX+1-2*S)/S).toFixed(2), h:+((maxY-minY+1-2*S)/S).toFixed(2) },
    canvasCentre:{ x:+(r.width/2).toFixed(2), y:+(r.height/2).toFixed(2) },
    artworkCentreInCanvas:{ x:+(((minX+maxX+1)/2)/S).toFixed(2), y:+(((minY+maxY+1)/2)/S).toFixed(2) },
    gridPitchDev:pitch, gridLineCount:lines.length,
    cellCssPx:+(((maxX-minX+1-2*S)/S)/16).toFixed(4),
    zoomLabel: zoomEl ? zoomEl.textContent.trim() : null,
    distinctColours: Object.keys(histo).sort(function(a,b){return histo[b]-histo[a];})
  };
})()`

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const out: Record<string, unknown> = {}
  for (const vp of VPS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2, colorScheme: 'light',
      isMobile: vp.width < 500, hasTouch: vp.width < 500,
    })
    const page = await ctx.newPage()
    try { await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60_000 }) }
    catch { await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 }) }
    await page.waitForTimeout(5000)
    console.log('-> ' + vp.name)
    out[vp.name] = await page.evaluate(PROBE)
    await ctx.close()
  }
  await browser.close()
  writeFileSync(join(OUT, 'canvas-geometry-breakpoints.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
