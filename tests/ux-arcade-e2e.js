/* 학생 플레이 지적 회귀: BP-1~5·7~9, RN-1~5·8, GL-2~4·6~7.
 * GL-1 별 기준의 채택 불가 반례·전략 분포는 glucose-logic.js에서 검증한다.
 * 실제 화면 코드를 가상 시계/프레임으로 진행한다. 가상 세포는 __run.state()에 넣고
 * 실제 update→deliver→finish 경로를 거친다. 저장 키·형식은 바꾸지 않는다.
 * PW=... E2E_BROWSER=chromium|webkit E2E_REDUCED_MOTION=0|1 node tests/ux-arcade-e2e.js <저장소 밖 폴더>
 */
const playwright = require(process.env.PW || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const browserName = process.env.E2E_BROWSER || 'chromium';
const reducedMotion = process.env.E2E_REDUCED_MOTION === '1';
const errors = [], failures = [], consoleErrors = [];
let ignoredManifestErrors = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { failures.push(msg); console.log('실패:', msg); } };
const toastMs = text => Math.min(6000, Math.max(2200, Array.from(text).length * 70));
const isFileManifest = url => {
  try { const u = new URL(url); return u.protocol === 'file:' && u.pathname.endsWith('/manifest.webmanifest') && !u.search && !u.hash; } catch { return false; }
};
const manifestMessages = new Set([
  'Origin null is not allowed by Access-Control-Allow-Origin. Status code: 0',
  'Failed to load resource: Origin null is not allowed by Access-Control-Allow-Origin. Status code: 0',
]);
function watchErrors(page) {
  let evidence = { url: page.url(), manifestFailed: false, otherFailed: false };
  page.on('framenavigated', f => { if (f === page.mainFrame()) evidence = { url: f.url(), manifestFailed: false, otherFailed: false }; });
  page.on('requestfailed', r => { if (isFileManifest(r.url())) evidence.manifestFailed = true; else evidence.otherFailed = true; });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text(), url = m.location().url || '';
    if (isFileManifest(url) && manifestMessages.has(text)) evidence.manifestFailed = true;
    consoleErrors.push({ text, url, evidence });
  });
}
function finishErrors() {
  for (const { text, url, evidence } of consoleErrors) {
    const confirmed = isFileManifest(url) || ((!url || url === evidence.url) && evidence.manifestFailed && !evidence.otherFailed);
    if (browserName === 'webkit' && manifestMessages.has(text) && confirmed) ignoredManifestErrors++;
    else errors.push(text);
  }
}

(async () => {
  let browser;
  try {
    if (!['chromium', 'webkit'].includes(browserName)) throw new Error(`지원하지 않는 E2E_BROWSER: ${browserName}`);
    if (!process.argv[2]) throw new Error('저장소 밖 스크린샷 폴더를 인자로 주세요.');
    const out = path.resolve(process.argv[2]), relative = path.relative(root, out);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('스크린샷 폴더는 저장소 밖이어야 합니다.');
    fs.mkdirSync(out, { recursive: true });
    if (fs.realpathSync(out) === root || fs.realpathSync(out).startsWith(root + path.sep)) throw new Error('저장소로 연결된 스크린샷 폴더입니다.');
    console.log(`엔진: ${browserName} · 동작 줄이기: ${reducedMotion ? '켬' : '끔'}`);
    browser = await playwright[browserName].launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true,
      deviceScaleFactor: 2, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      window.__paint = [];
      // 캔버스에 실제로 그린 좌표·글꼴·색을 관찰한다(화면 함수는 바꾸지 않는다).
      for (const name of ['fillText', 'arc', 'fill', 'fillRect']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          window.__paint.push({ name, args, font: this.font, color: this.fillStyle });
          return original.apply(this, args);
        };
      }
      let seed = 37;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    });
    async function open(id) {
      const page = await context.newPage(); watchErrors(page);
      await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-06T00:00:01Z'));
      await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
      await page.goto(pathToFileURL(path.join(root, 'games', id, 'index.html')).href);
      // 시계 설치가 끝난 문서에서 프레임만 수동으로 진행한다. 아직 게임은 시작 전이다.
      await page.evaluate(() => {
        let frameNow = performance.now(), nextId = 0;
        const pending = new Map();
        performance.now = () => frameNow;
        window.requestAnimationFrame = cb => { pending.set(++nextId, cb); return nextId; };
        window.cancelAnimationFrame = id => pending.delete(id);
        window.__tick = (count = 1) => {
          for (let i = 0; i < count; i++) {
            frameNow += 40; window.__paint = [];
            const batch = [...pending.values()]; pending.clear(); batch.forEach(cb => cb(frameNow));
          }
        };
      });
      await page.evaluate(() => window.Arcade.setStudent({ id: '20315', name: '테스트' }));
      return page;
    }
    const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

    // CI-1~CI-11: 혈액 순환 일주 그래픽 A(D-068) 회귀
    let ci = await open('circulation');
    const ciStore = await ci.evaluate(() => localStorage.getItem('bioArcade.v1'));
    await ci.click('#ar-start');
    const artGeometry = await ci.evaluate(() => {
      const board = document.getElementById('board');
      const transform = el => board.getCTM().inverse().multiply(el.getCTM());
      const point = (el, p) => new DOMPoint(p.x, p.y).matrixTransform(transform(el));
      const sample = (el, n) => Array.from({ length:n }, (_,i) => point(el,el.getPointAtLength(el.getTotalLength()*i/n)));
      const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
      const nearest = (p,points) => Math.min(...points.map(q => distance(p,q)));
      const inside = (p,poly) => {
        let inPoly=false;
        for (let a=0,b=poly.length-1;a<poly.length;b=a++) {
          const u=poly[a],v=poly[b];
          if ((u.y>p.y)!==(v.y>p.y) && p.x<(v.x-u.x)*(p.y-u.y)/(v.y-u.y)+u.x) inPoly=!inPoly;
        }
        return inPoly;
      };
      const wallEl=board.querySelector('.heart-outline');
      // 새 그림이 없는 이전 화면도 예외 대신 CI-1 실패로 보고한다.
      if (!wallEl) return { missing:true };
      const wall=sample(wallEl,1500), chambers={}, medians={}, acc={RA:[],RV:[],LA:[],LV:[]};
      for (const k of Object.keys(acc)) chambers[k]=sample(board.querySelector(`path.chamber[data-chamber="${k}"]`),600);
      const scale=Math.hypot(transform(wallEl).a,transform(wallEl).b);
      for (const p of wall) {
        const distances=Object.keys(chambers).map(k => [k,nearest(p,chambers[k])]).sort((a,b) => a[1]-b[1]);
        if (distances[0][1]<45*scale) acc[distances[0][0]].push(distances[0][1]);
      }
      for (const k of Object.keys(acc)) { acc[k].sort((a,b) => a-b); medians[k]=acc[k][acc[k].length>>1]; }
      // 검토 측정 2절: 방 위 도형과 관 외곽을 장애물로 포함해 보이는 벽을 잰다.
      const boxPoints = el => {
        const b=el.getBBox(), ps=[], perimeter=2*(b.width+b.height);
        for (let i=0;i<200;i++) {
          let d=perimeter*i/200,x,y;
          if (d<b.width) { x=b.x+d;y=b.y; }
          else if ((d-=b.width)<b.height) {x=b.x+b.width;y=b.y+d;}
          else if ((d-=b.height)<b.width) {x=b.x+b.width-d;y=b.y+b.height;}
          else {d-=b.width;x=b.x;y=b.y+b.height-d;}
          ps.push(point(el,{x,y}));
        }
        return ps;
      };
      const obstacles={},visible={RA:[],RV:[],LA:[],LV:[]};
      for (const k of Object.keys(visible)) {
        const group=board.querySelector(`.square[data-square="${k}"]`);
        obstacles[k]=chambers[k].concat(...[...group.querySelectorAll('text, rect, ellipse, circle')].map(boxPoints));
      }
      const drop=board.querySelector('#drop');
      if (drop && obstacles[drop.dataset.square]) obstacles[drop.dataset.square].push(...boxPoints(drop));
      const tubes=[...board.querySelectorAll('path[data-vessel]')].map(el => sample(el,800));
      for (const p of wall) {
        const ds=Object.keys(obstacles).map(k => [k,nearest(p,obstacles[k])]).sort((a,b) => a[1]-b[1]);
        const tubeDistance=Math.min(...tubes.map(ps => nearest(p,ps)-9.3));
        if (ds[0][1]<45*scale && ds[0][1]<=tubeDistance) visible[ds[0][0]].push(ds[0][1]);
      }
      const visibleMedians=Object.fromEntries(Object.entries(visible).map(([k,ds]) => {ds.sort((a,b) => a-b);return [k,ds[ds.length>>1]];}));
      const gap = (a,b) => Math.min(...chambers[a].map(p => nearest(p,chambers[b])));
      const septum=gap('RV','LV');
      const valveDistances={};
      for (const [edge,from,to,vessel] of [['RA:RV','RA','RV',null],['RV:PA1','RV',null,'PA'],['LA:LV','LA','LV',null],['LV:Ao1','LV',null,'Ao']]) {
        const el=board.querySelector(`.valve[data-edge="${edge}"]`), box=el.getBBox();
        const center=point(el,{x:box.x+box.width/2,y:box.y+box.height/2});
        valveDistances[edge]=[nearest(center,chambers[from]),nearest(center,to ? chambers[to] : sample(board.querySelector(`[data-vessel="${vessel}"]`),1200))];
      }
      const ao=board.querySelector('[data-vessel="Ao"]'), start=point(ao,ao.getPointAtLength(0)), next=point(ao,ao.getPointAtLength(1));
      const lvX=chambers.LV.map(p => p.x);
      // use의 사각형 대신 원본 다리 path를 같은 viewBox 배율로 놓아 실제 그림 높이를 잰다.
      const leg=board.querySelector('[data-organ="leg-muscle"]');
      const symbol=document.getElementById(leg.getAttribute('href').slice(1)), vb=symbol.viewBox.baseVal;
      const width=+leg.getAttribute('width'),height=+leg.getAttribute('height'), legScale=Math.min(width/vb.width,height/vb.height);
      const legGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
      legGroup.setAttribute('visibility','hidden');
      legGroup.setAttribute('transform',`translate(${+leg.getAttribute('x')+(width-vb.width*legScale)/2} ${+leg.getAttribute('y')+(height-vb.height*legScale)/2}) scale(${legScale}) translate(${-vb.x} ${-vb.y})`);
      for (const p of symbol.querySelectorAll('path')) legGroup.appendChild(p.cloneNode(true));
      board.appendChild(legGroup);
      const legBoxes=[...legGroup.querySelectorAll('path')].map(el => {const b=el.getBBox();return [point(el,{x:b.x,y:b.y}).y,point(el,{x:b.x,y:b.y+b.height}).y];});
      const legHeight=Math.max(...legBoxes.map(b => b[1]))-Math.min(...legBoxes.map(b => b[0]));
      legGroup.remove();
      return { medians, visibleMedians, septum, gaps:[gap('RA','RV')/scale,gap('LA','LV')/scale],
        outside:Object.values(chambers).reduce((n,ps) => n+ps.filter(p => !inside(p,wall)).length,0),
        valveDistances, aoDistance:nearest(start,chambers.LV), aoRight:start.x>(Math.min(...lvX)+Math.max(...lvX))/2, aoDx:next.x-start.x,
        legHeight };
    });
    const m=artGeometry.medians || {}, v=artGeometry.visibleMedians || {};
    check(!artGeometry.missing && m.LV>=1.6*m.RV && m.RV>=1.3*Math.max(m.RA,m.LA) && artGeometry.septum/m.LV>=.6 && artGeometry.septum/m.LV<=.9 && artGeometry.outside===0 && artGeometry.gaps.every(d => d<=4.5) && v.LV>=1.6*v.RV && v.RV>Math.max(v.RA,v.LA), `CI-1 심장 벽·보이는 벽·중격·방 포함·방 사이 간격: ${JSON.stringify(artGeometry)}`);
    check(!artGeometry.missing && Object.keys(artGeometry.valveDistances).length===4 && Object.values(artGeometry.valveDistances).every(ds => ds.every(d => d<=8)), `CI-2 판막이 방 경계·동맥 뿌리에서 8 이내: ${JSON.stringify(artGeometry.valveDistances)}`);
    check(!artGeometry.missing && artGeometry.aoDistance<=8 && artGeometry.aoRight && artGeometry.aoDx>0, 'CI-3 대동맥은 좌심실 오른쪽 가까이에서 오른쪽으로 나감');
    const artDisplay = await ci.evaluate(() => {
      const C=window.Circulation, state=window.__circ.state();
      const groups=[...document.querySelectorAll('#board .square')];
      // 금색 현재 칸 표시를 잠깐 빼고 실제 평소 테두리색을 읽은 뒤 복원한다.
      const highlights=groups.filter(g => g.classList.contains('current') || g.classList.contains('asked')).map(g => [g,g.getAttribute('class')]);
      highlights.forEach(([g]) => g.classList.remove('current','asked'));
      const chamberColors=Object.fromEntries(['RA','RV','LA','LV'].map(k => [k,getComputedStyle(document.querySelector(`path.chamber[data-chamber="${k}"]`)).stroke]));
      highlights.forEach(([g,classes]) => g.setAttribute('class',classes));
      const color=k => chamberColors[k];
      const rims=!!document.querySelector('path.chamber') && color('RA')===color('LV') && color('RV')===color('LA') && color('RA')!==color('RV');
      const legend=document.getElementById('board').textContent;
      const names=[...document.querySelectorAll('text.circuit-name')];
      const rgb=hex => {const p=hex.slice(1).match(/../g).map(x => parseInt(x,16));return `rgb(${p.join(', ')})`;};
      const namesMatch=names.length===2 && names[0].dataset.circuit==='pulmonary' && names[1].dataset.circuit==='systemic' && getComputedStyle(names[0]).fill!==getComputedStyle(names[1]).fill && names.every(n => getComputedStyle(n).fill===color(n.dataset.circuit==='pulmonary' ? 'RV' : 'RA') && getComputedStyle(n).fill===rgb(window.CirculationBoard.circuit[n.dataset.circuit]));
      const luminance=c => {const ns=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x => x/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4);return ns[0]*.2126+ns[1]*.7152+ns[2]*.0722;};
      const contrast=(a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      const nameContrast=names.every(n => contrast(getComputedStyle(n).fill,'rgb(247, 251, 241)')>=4.5);
      const dotsContrast=groups.every(g => [...g.querySelectorAll('circle')].every(dot => {
        const center=new DOMPoint(+dot.getAttribute('cx'),+dot.getAttribute('cy')).matrixTransform(dot.getCTM());
        // 나중에 그린 혈액색 알약을 고른다. 크림색 변이는 낮은 대비로 실패한다.
        const beds=[...g.querySelectorAll('.oxygen-bed, .chamber, rect')].reverse();
        const bed=beds.find(el => el.isPointInFill(center.matrixTransform(el.getCTM().inverse())));
        return !!bed && contrast(getComputedStyle(dot).fill,getComputedStyle(bed).fill)>=3;
      }));
      return { circuits:groups.length===18 && C.SQUARES.every(s => groups.find(g => g.dataset.square===s.id)?.dataset.circuit===s.circuit), rims,
        legend:legend.includes('폐순환') && legend.includes('온몸순환') && !legend.includes('우심실→좌심방') && !legend.includes('좌심실→우심방') && !legend.includes('?→?'), namesMatch, nameContrast, dotsContrast,
        oxygen:C.SQUARES.filter(s => s.kind!=='capillary').every(s => document.querySelectorAll(`.square[data-square="${s.id}"] circle`).length===C.BLOOD[s.blood].oxygen),
        drop:document.querySelectorAll('#drop circle').length===C.BLOOD.high.co2 && document.querySelector('#drop path')?.getAttribute('fill')===C.BLOOD.high.color,
        score:document.getElementById('score').textContent===`${C.hud(state).score}점`, best:document.getElementById('best')?.textContent };
    });
    check(artDisplay.circuits && artDisplay.rims && artDisplay.legend && artDisplay.namesMatch && artDisplay.nameContrast, 'CI-4 18칸 소속·네 방 테두리·순환 이름 data-circuit·색 일치·글자 대비');
    check(artDisplay.oxygen && artDisplay.drop && artDisplay.dotsContrast, 'CI-5 혈관·방의 O₂ 개수·모든 칸의 점과 바로 밑 바탕 대비 3:1·방울 색·CO₂ 고리');
    // 규칙 상태는 건드리지 않고 문자열 렌더러로 18칸·보충 심장 방을 그려 검사한다.
    const artOverlap = await ci.evaluate(() => {
      const board=document.getElementById('board'), original=board.innerHTML;
      const C=window.Circulation, B=window.CirculationBoard;
      const stateBefore=JSON.stringify(window.__circ.state());
      const labels=Object.fromEntries(Object.keys(C.STRUCTURES).map(k => [k,true]));
      const overlaps=[], outside=[], dashed=[];
      let views=0;
      const boardPoint=(el,p) => new DOMPoint(p.x,p.y).matrixTransform(board.getCTM().inverse().multiply(el.getCTM()));
      const localPoint=(el,p) => new DOMPoint(p.x,p.y).matrixTransform(el.getCTM().inverse().multiply(board.getCTM()));
      try {
        for (const names of [{},labels]) for (const sq of C.SQUARES) {
          board.innerHTML=B.svg({labels:names,current:sq.id,dropSquare:sq.id,dropBlood:sq.bloodOut || sq.blood});
          views++;
          const drop=board.querySelector('#drop'), b=drop.getBBox();
          const a=boardPoint(drop,{x:b.x,y:b.y}), z=boardPoint(drop,{x:b.x+b.width,y:b.y+b.height});
          // 상자 내부까지 0.75 판 단위 이하로 표본화해 얇은 테두리와 포함된 방도 잡는다.
          const points=[], nx=Math.ceil((z.x-a.x)/.75), ny=Math.ceil((z.y-a.y)/.75);
          for (let x=0;x<=nx;x++) for (let y=0;y<=ny;y++) points.push({x:a.x+(z.x-a.x)*x/nx,y:a.y+(z.y-a.y)*y/ny});
          for (const chamber of board.querySelectorAll('path.chamber')) {
            const id=chamber.dataset.chamber;
            if (id===sq.id) {
              if (points.some(p => !chamber.isPointInFill(localPoint(chamber,p)))) outside.push([sq.id,Object.keys(names).length]);
            } else if (points.some(p => {
              const q=localPoint(chamber,p);
              return chamber.isPointInFill(q) || chamber.isPointInStroke(q);
            })) overlaps.push([sq.id,id,Object.keys(names).length]);
          }
        }
        for (const id of ['RA','RV','LA','LV']) {
          board.innerHTML=B.svg({labels,asked:[id],dropSquare:'LV',dropBlood:'high'});
          const group=board.querySelector(`.square.asked[data-square="${id}"]`);
          const chamber=group?.querySelector(`path.chamber[data-chamber="${id}"]`);
          dashed.push({id,ok:!!chamber && getComputedStyle(chamber).strokeDasharray!=='none' && !board.querySelector('.square.current')});
        }
      } finally { board.innerHTML=original; }
      return {views,overlaps,outside,dashed,restored:board.innerHTML===original,stateUnchanged:stateBefore===JSON.stringify(window.__circ.state())};
    });
    check(artOverlap.views===36 && !artOverlap.overlaps.length && !artOverlap.outside.length && artOverlap.restored && artOverlap.stateUnchanged, `CI-10 18칸 방울과 다른 방 path의 채움·선 겹침 없음·자기 방 안·판 복원·상태 보존: ${JSON.stringify(artOverlap)}`);
    check(artOverlap.dashed.length===4 && artOverlap.dashed.every(d => d.ok), `CI-11 묻는 심장 방 네 path의 실제 점선: ${JSON.stringify(artOverlap.dashed)}`);
    check(artDisplay.score && artDisplay.best==='내 최고 —', 'CI-6 점수는 규칙 HUD와 같고 기록이 없으면 내 최고 —');
    check(!artGeometry.missing && artGeometry.legHeight>=34, `CI-9 다리 근육 그림 높이 34 이상: ${artGeometry.legHeight}`);
    await ci.evaluate(() => {
      const d=window.Arcade.data(); d.student={id:'20315',name:'테스트'};
      d.games.circulation={best:2,bestScore:320,plays:[]};
      localStorage.setItem('bioArcade.v1',JSON.stringify(d));
    });
    await ci.close(); ci=await open('circulation'); await ci.click('#ar-start');
    check(await ci.textContent('#best')==='내 최고 320', 'CI-6 가상 최고 기록 320을 읽음');
    for (const [width,height] of [[360,640],[390,844],[412,780]]) {
      await ci.setViewportSize({width,height});
      const fit=await ci.evaluate(() => {
        const bar=document.querySelector('header.bar').getBoundingClientRect();
        const labels=['mode','score','best'].map(id => document.getElementById(id).getBoundingClientRect());
        return { x:document.documentElement.scrollWidth<=innerWidth+1,
          labels:labels.every(r => r.left>=bar.left && r.right<=bar.right && r.top>=bar.top && r.bottom<=bar.bottom) && labels.every((a,i) => labels.slice(i+1).every(b => a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top)),
          link:document.querySelector('.bar a').getBoundingClientRect().height>=44 };
      });
      check(fit.x && fit.labels && fit.link, `CI-7 ${width}×${height} 가로 넘침·정보 띠 잘림·복귀 링크: ${JSON.stringify(fit)}`);
      await shot(ci,`circulation-art-${width}x${height}`);
    }
    await ci.evaluate(() => window.__circ.fast(true));
    // 시작 이름은 실제 보기 버튼으로 답하고, 계속·굴리기까지 시계를 진행한다.
    for (let guard=0;guard<8;guard++) {
      const p=await ci.evaluate(() => window.__circ.pending());
      if (p.type==='die') break;
      const pick=await ci.evaluate(() => window.__circ.correct());
      await ci.locator(p.options.length && pick!=null ? `#ctrl button[data-k="${pick}"]:not([disabled])` : '#ctrl button:not([disabled])').first().click();
      await ci.clock.runFor(100);
    }
    const glyphs=await ci.evaluate(() => ({
      clean:!/[⚀-⚅]|\p{Extended_Pictographic}/u.test(document.body.innerText+document.getElementById('board').textContent),
      back:!!document.querySelector('.bar a svg'),
      dice:window.__circ.pending().type==='die' && document.querySelectorAll('.sheet-opts.dice .btn').length===2 && [...document.querySelectorAll('.sheet-opts.dice .btn')].every(b => b.querySelector('svg') && /[1-6]칸\s*→/.test(b.textContent)) }));
    check(glyphs.clean && glyphs.back && glyphs.dice, `CI-8 그림 문자 없이 SVG 복귀·주사위와 숫자 칸 표시: ${JSON.stringify(glyphs)}`);
    await ci.evaluate(saved => { if (saved===null) localStorage.removeItem('bioArcade.v1'); else localStorage.setItem('bioArcade.v1',saved); }, ciStore);
    await ci.close();

    // BP-1: 실제 resolve가 만든 모든 연쇄 판·강조 타일·수소 결합 합계·점수를 대조한다.
    const bp = await open('basepang');
    check((await bp.textContent('#overlay')).includes('80·160·260') && (await bp.textContent('#overlay')).includes('40·70·110'), 'BP-5 시작 별 기준');
    await bp.click('#ar-start');
    await bp.evaluate(() => {
      const B = window.BasePang, resolve = B.resolve;
      B.resolve = (...args) => (window.__resolved = resolve(...args));
      window.__swapValid = () => {
        const g = window.__game.grid(), level = window.__game.level();
        let fallback = null;
        for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const b = { x: x + dx, y: y + dy };
          if (b.x >= B.W || b.y >= B.H) continue;
          const swapped = B.swap(g, { x, y }, b);
          if (!B.findPairs(level, swapped).length) continue;
          // 보충 시드를 바꾸지 않고, 기존 타일의 낙하로 연쇄가 생기는 교환을 찾는다.
          let n = 37;
          const r = resolve(level, swapped, () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 2 ** 32));
          if (r.steps.length >= 2) { window.__game.trySwap({ x, y }, b); return; }
          fallback ||= { a: { x, y }, b };
        }
        if (fallback) { window.__game.trySwap(fallback.a, fallback.b); return; }
        throw new Error('유효한 교환 없음');
      };
    });
    for (const level of [1, 2]) {
      let multiChainMoves = 0;
      const pos = await bp.getAttribute('.tile[data-y="2"][data-x="1"]', 'aria-label');
      check(pos.startsWith('3행 2열,'), 'BP-8 타일 행·열 안내');
      for (const [width, height] of [[360, 640], [375, 548], [390, 664], [390, 720], [412, 780]]) {
        await bp.setViewportSize({ width, height });
        await bp.waitForTimeout(50); // ResizeObserver가 바뀐 실제 무대 높이를 계산하게 한다.
        const geometry = await bp.evaluate(() => {
          const g = document.getElementById('grid').getBoundingClientRect();
          const b = document.querySelector('.board').getBoundingClientRect();
          const tiles = [...document.querySelectorAll('.tile')].map(t => t.getBoundingClientRect());
          return { top: g.top, bottom: g.bottom, left: g.left, right: g.right,
            size: Math.min(...tiles.flatMap(t => [t.width, t.height])),
            square: tiles.every(t => Math.abs(t.width - t.height) < 0.1),
            optimal: Math.min((b.width - 27) / 6, (b.height - 33) / 8),
            allVisible: tiles.every(t => t.top >= 0 && t.bottom <= innerHeight && t.left >= 0 && t.right <= innerWidth) };
        });
        const label = `BP 배치 ${level}단계 ${width}×${height}`;
        check(geometry.top >= 0 && geometry.bottom <= height && geometry.left >= 0 && geometry.right <= width && geometry.allVisible, `${label}: 판 전체 표시`);
        check(geometry.size >= 44 && geometry.square, `${label}: 정사각형 칸 44px 이상`);
        check(Math.abs(geometry.size - geometry.optimal) < 0.1, `${label}: 남은 공간에서 가능한 최대 칸 크기`);
        console.log(`${label}: 칸 ${geometry.size.toFixed(2)}px, 판 ${geometry.top.toFixed(2)}~${geometry.bottom.toFixed(2)}px`);
        await shot(bp, `basepang-${level}-${width}-${height}`);
      }
      await bp.setViewportSize({ width: 390, height: 664 }); await bp.waitForTimeout(50);
      if (level === 2) {
        check((await bp.textContent('.legend-key')).includes('DNA A → RNA U, T → A, G → C, C → G'), 'BP 전사 핵심 규칙은 접어도 표시');
        await bp.click('.legend-details summary');
        check(await bp.locator('.legend-body').isVisible() && (await bp.textContent('.legend-body')).includes('네모 = DNA 주형, 동그라미 = RNA'), 'BP 전사 범례 펼치면 원래 설명 표시');
        await bp.click('.legend-details summary');
      }
      const layout = await bp.evaluate(() => {
        const legend = document.getElementById('legend').getBoundingClientRect(), grid = document.getElementById('grid').getBoundingClientRect();
        return { top: legend.top, bottom: legend.bottom, gridTop: grid.top, gridBottom: grid.bottom, h: innerHeight };
      });
      check(layout.top >= 0 && layout.bottom <= layout.h && layout.bottom <= layout.gridTop, 'BP-7 짧은 화면 규칙을 판 위에 표시');
      check(layout.gridBottom <= layout.h, 'BP-7 짧은 화면에서 판 마지막 줄까지 표시');
      for (let move = 0; move < 15; move++) {
        const before = Number(await bp.textContent('#score'));
        await bp.evaluate(() => window.__swapValid());
        const resolved = await bp.evaluate(() => window.__resolved);
        if (resolved.steps.length >= 2) multiChainMoves++;
        let score = before;
        for (let i = 0; i < resolved.steps.length; i++) {
          const step = resolved.steps[i]; score += step.gained;
          const view = await bp.evaluate(() => ({
            tiles: [...document.querySelectorAll('.tile')].map(t => ({ x: +t.dataset.x, y: +t.dataset.y, base: t.textContent,
              strand: t.classList.contains('R') ? 'R' : 'D', pop: t.classList.contains('pop') })),
            score: +document.getElementById('score').textContent, toast: document.getElementById('toast').textContent,
            overlay: document.getElementById('overlay').hidden,
          }));
          const marked = new Set(step.pairs.flatMap(p => [`${p.x},${p.y}`, `${p.x + 1},${p.y}`]));
          check(!!step.grid && view.tiles.every(t => step.grid[t.y][t.x].b === t.base && step.grid[t.y][t.x].s === t.strand && t.pop === marked.has(`${t.x},${t.y}`)), `BP-1 ${level}단계 ${move + 1}이동 ${i + 1}연쇄 판·강조`);
          check(view.score === score && view.toast.includes(`수소 결합 합계 ${step.gained / step.chain}개`) && view.toast.includes(`짝 ${step.pairs.length}쌍`), 'BP-1 실제 강조 짝과 결합 합계·점수 일치');
          check(view.overlay, 'BP-3 마지막 피드백을 읽기 전에 결과가 열리지 않음');
          if (move === 0 && i === 0) {
            const overlap = await bp.evaluate(() => {
              const a = document.getElementById('toast').getBoundingClientRect(), b = document.getElementById('grid').getBoundingClientRect();
              return a.bottom > b.top;
            });
            check(!overlap, 'BP-2 피드백이 첫 줄 염기를 가리지 않음');
            await shot(bp, `basepang-${level}-chain`);
          }
          if (move === 14 && i === 0) {
            // 마지막 이동은 실제 탭으로 건너뛰어 타이머 정리·점수·결과 카드의 다시 읽기를 본다.
            await bp.locator('.tile').first().tap({ force: true });
            check(await bp.locator('.tile.pop').count() === 0 && !(await bp.getAttribute('#toast', 'class')).includes('replaying'), 'BP 연쇄 탭으로 즉시 재생 종료');
            const history = await bp.locator('#overlay .replay-history li').allTextContents();
            check(history.length === resolved.steps.length && history.every((text, j) => text.includes(`${j + 1}연쇄`) && text.includes(`수소 결합 합계 ${resolved.steps[j].gained / resolved.steps[j].chain}개`)), 'BP 건너뛴 단계도 결과 카드에서 모두 다시 읽기');
            await bp.click('#overlay .replay-history summary');
            check(await bp.locator('#overlay .replay-history li').first().isVisible(), 'BP 결과 카드 연쇄 문구 펼치기');
            await bp.clock.runFor(60000);
            check(await bp.evaluate(() => window.__game.moves()) === 0 && Number(await bp.textContent('#score')) === before + resolved.score, 'BP 건너뛰기 뒤 남은 타이머가 점수·이동을 중복 처리하지 않음');
            break;
          }
          const ms = toastMs(view.toast);
          await bp.clock.runFor(ms - 1);
          check(await bp.evaluate(() => document.getElementById('overlay').hidden), 'BP-3 최소 표시 시간 보장');
          await bp.clock.runFor(1);
        }
        check(Number(await bp.textContent('#score')) === before + resolved.score, 'BP-1 연쇄 점수 합계 유지');
      }
      check(multiChainMoves > 0, `BP-1 ${level}단계 실제 2연쇄 이상 교환을 재생`);
      if (level === 1) {
        check((await bp.textContent('#overlay')).includes('실제 주형 DNA는 남는다'), 'BP-4 / Q2 주형 보존 설명');
        await bp.click('#go2');
        check(await bp.textContent('#toast') === '' && !(await bp.getAttribute('#toast', 'class')).includes('on'), 'BP-3 2단계에 앞 단계 토스트가 남지 않음');
      }
    }
    await bp.click('.flow-opts .btn[data-i="0"]');
    check((await bp.textContent('.refl')).includes('해설을 참고해 정리'), 'BP-9 / Q5 설명해 보기 성격 표시');
    check((await bp.textContent('#overlay')).includes('다음 별까지') || (await bp.textContent('#overlay')).includes('별 3개 기준'), 'BP-5 결과에 다음 별 안내');
    await shot(bp, 'basepang-result'); check(await noOverflow(bp), 'BP 가로 넘침 없음'); await bp.close();

    // RN-1: 학습 두 문장을 연속 발생시키고 그 사이에 충돌을 넣어 독립·순서·표시 시간을 본다.
    const rn = await open('run');
    const rules = await rn.textContent('#overlay');
    check(rules.includes('회색 장애물') && rules.includes('뛰어넘는다') && rules.includes('12 줄어든다'), 'RN-3 시작 카드 회피·감점 규칙');
    await rn.click('#ar-start');
    await rn.evaluate(() => {
      const s = window.__run.state(); s.queue = []; s.items = []; s.E = 90; s.nut = ['glu', 'amino']; s.O = 2;
      window.__item = (kind, missed = false) => {
        s.y = 300; s.vy = 0;
        s.items = [{ k: kind, x: missed ? 75 : 119.2, y: 278, z: 'muscle' }];
        window.__tick();
      };
      window.__item('cell');
    });
    const firstLesson = await rn.textContent('#lesson');
    check(firstLesson.includes('세포 호흡'), 'RN-1 첫 전달 학습 설명 발생');
    await rn.evaluate(() => window.__item('wall'));
    check((await rn.textContent('#toast')).includes('쿵!') && await rn.textContent('#lesson') === firstLesson, 'RN-1 충돌이 학습 설명을 덮지 않음');
    check(await rn.getAttribute('#toast', 'role') === 'status' && await rn.getAttribute('#lesson', 'role') === 'status', 'RN-8 / Q8 상태 영역');
    await rn.evaluate(() => window.__item('cell'));
    check(await rn.textContent('#lesson') === firstLesson, 'RN-1 다음 학습 설명은 앞 설명 뒤에 대기');
    await rn.clock.runFor(toastMs(firstLesson) - 1);
    check(await rn.textContent('#lesson') === firstLesson, 'RN-1 학습 문장 전체 표시 시간');
    await rn.clock.runFor(1);
    const amino = await rn.textContent('#lesson');
    check(amino.includes('암모니아') && amino.includes('간에서 요소'), 'RN-1 간·암모니아 설명 이어서 표시');
    await rn.evaluate(() => { window.__run.state().hurt = 0; window.__item('wall'); });
    check(await rn.textContent('#lesson') === amino, 'RN-1 암모니아 설명도 충돌 뒤 유지');
    await shot(rn, 'run-lesson-collision');
    await rn.evaluate(() => {
      const s = window.__run.state();
      s.O = 0; s.nut = ['glu']; window.__item('cell');
      s.O = 1; s.nut = []; window.__item('cell');
      s.O = 0; s.nut = []; window.__item('cell');
      window.__item('cell', true);
      s.items = [{ k: 'wall', x: 350, y: 300 }, { k: 'glu', x: 400, y: 278 }, { k: 'cell', x: 450, y: 278, z: 'muscle' }];
      window.__tick();
    });
    const ink = await rn.evaluate(() => window.__paint);
    check(ink.some(p => p.name === 'fill' && p.color === '#526477') && ink.some(p => p.name === 'fill' && p.color === '#e0a412'), 'RN-3 장애물과 포도당 색 구분');
    check(ink.filter(p => p.name === 'fillText').every(p => parseFloat(p.font.match(/[\d.]+px/)[0]) >= 16), 'RN-4 캔버스 글꼴 16px 이상');
    await rn.evaluate(() => { const s = window.__run.state(); s.items = []; s.E = .01; window.__tick(); });
    const result = await rn.textContent('#overlay');
    check(result.includes('지나간 세포 6개') && result.includes('닿지 못한 세포 1개') && result.includes('부딪힘 2번'), 'RN-2 지나간·놓친 세포와 충돌 횟수 분리');
    check(result.includes('산소가 없어') && result.includes('영양소가 없어') && result.includes('산소와 영양소가 모두 없어'), 'RN-2 전달 실패 세 원인 구분');
    check(result.includes('암모니아') && result.includes('간에서 요소'), 'RN-1 결과 카드에도 간·암모니아 설명');
    await shot(rn, 'run-result');
    await rn.click('#ar-retry');
    const reset = await rn.evaluate(() => ({ energy: document.getElementById('e-v').textContent,
      ratio: document.getElementById('e-b').getBoundingClientRect().width / document.getElementById('e-b').parentElement.getBoundingClientRect().width,
      lesson: document.getElementById('lesson').textContent, toast: document.getElementById('toast').textContent }));
    check(reset.energy === '100' && Math.abs(reset.ratio - 1) < .01 && !reset.lesson && !reset.toast, 'RN-5 다시 하기 즉시 막대·피드백 초기화');
    check(await noOverflow(rn), 'RN 가로 넘침 없음'); await rn.close();

    // GL-2·3·6: 누르지 않은 판/계속 누른 판을 끝까지 돌려 그래프 상하한과 결과를 본다.
    const gl = await open('glucose');
    await gl.evaluate(() => { const init = window.GlucoseModel.init; window.GlucoseModel.init = mode => (window.__glucose = init(mode)); });
    check((await gl.textContent('.hint')).includes('Space 누르고 있기'), 'GL-4 / Q8 Space 안내');
    await gl.click('#ar-start');
    await gl.keyboard.down('Space'); await gl.evaluate(() => window.__tick(10));
    const held = await gl.evaluate(() => window.__glucose.ins);
    await gl.keyboard.up('Space'); await gl.evaluate(() => window.__tick(10));
    check(await gl.evaluate(() => window.__glucose.ins) < held, 'GL-4 Space 누름·뗌 실제 호르몬 조절');
    await gl.evaluate(() => window.__tick(500));
    const graph = await gl.evaluate(() => ({ g: window.__glucose.g, paint: window.__paint }));
    const number = graph.paint.find(p => p.name === 'fillText' && p.args[0] === '350 mg/dL');
    const dot = graph.paint.find(p => p.name === 'arc' && p.args[2] === 8);
    check(graph.g === 350 && number && number.args[2] - 18 > 40 && dot && dot.args[1] - 8 > 40, 'GL-6 상한 350의 숫자·점이 호르몬 막대 아래에 있음');
    check(graph.paint.filter(p => p.name === 'fillText').every(p => parseFloat(p.font.match(/[\d.]+px/)[0]) >= 16), 'GL-3 그래프 글꼴 16px 이상');
    await gl.clock.runFor(6000);
    await shot(gl, 'glucose-upper-bound');
    await gl.evaluate(() => window.__tick(606));
    check((await gl.textContent('#overlay')).includes('180 초과') && (await gl.textContent('#overlay')).includes('조금 더 일찍 눌러'), 'GL-2 고혈당 시간·개선 방향');
    check((await gl.textContent('.refl')).includes('해설을 참고해 정리'), 'GL-7 / Q5 설명해 보기 성격 표시');
    await gl.click('#ar-retry'); await gl.keyboard.down('Space'); await gl.evaluate(() => window.__tick(300));
    const low = await gl.evaluate(() => ({ g: window.__glucose.g, dot: window.__paint.find(p => p.name === 'arc' && p.args[2] === 8) }));
    check(low.g === 30 && low.dot.args[1] + 8 < 640, 'GL-6 하한 30의 점도 캔버스 안에 있음');
    await shot(gl, 'glucose-lower-bound');
    await gl.evaluate(() => window.__tick(826)); await gl.keyboard.up('Space');
    check((await gl.textContent('#overlay')).includes('70 미만') && (await gl.textContent('#overlay')).includes('54 미만') && (await gl.textContent('#overlay')).includes('조금 더 일찍 손을 떼어'), 'GL-2 저혈당 시간·개선 방향');
    await gl.fill('#ar-refl', '테스트 답'); await gl.keyboard.press('End'); await gl.keyboard.press('Space'); await gl.keyboard.type('정리');
    await gl.clock.runFor(350);
    const saved = await gl.evaluate(() => window.Arcade.data().games.glucose.plays.at(-1));
    check(saved.reflection === '테스트 답 정리', 'GL Q5 결과 입력의 띄어쓰기·자동 저장 유지');
    check(await noOverflow(gl), 'GL 가로 넘침 없음'); await shot(gl, 'glucose-result');
    await gl.setViewportSize({ width: 390, height: 844 });
    check(await noOverflow(gl), 'GL 844 높이 가로 넘침 없음');
    for (const [ratio, earned] of [[0.95, 3], [0.8, 2]]) {
      await gl.click('#ar-retry');
      await gl.evaluate(ratio => {
        const s = window.__glucose, M = window.GlucoseModel;
        s.t = M.DAY - 0.04; s.tir = M.DAY * ratio - 0.04; s.severe = M.SEVERE_LIMIT; s.g = 100;
        window.__tick(3);
      }, ratio);
      const result = await gl.textContent('#overlay');
      check(result.includes('별 1개 상한이 적용됐다') && result.includes(`줄이면 별 ${earned}개를 받을 수 있다.`), `GL 상한 판 목표 범위 ${ratio * 100}%: 저혈당 시간을 줄이면 별 ${earned}개 안내`);
    }
    await gl.close();
  } catch (error) {
    failures.push(error.stack || String(error));
  } finally {
    finishErrors();
    console.log(`단언: ${checks}개`);
    console.log('errors:', errors.length ? errors : 'none');
    console.log(`무시한 오류: webkit file:// manifest ${ignoredManifestErrors}건`);
    console.log('failures:', failures.length ? failures : 'none');
    if (errors.length || failures.length) process.exitCode = 1;
    if (browser) await browser.close();
  }
})();
