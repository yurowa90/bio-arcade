'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../..');
const STAGE = { width: 780, height: 1864, band: 88, gameWidth: 390, gameHeight: 844, scale: 2 };
const STAGE_PATH = '/__video/stage.html';
const FINGER_FADE_MS = 600;
const FINGER_HOME = { x: STAGE.width / 2, y: STAGE.height - 40 };
const ORDER = ['hub', 'quest', 'mendel', 'pedigree', 'basepang', 'run', 'glucose', 'circulation', 'organization'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };

// 아직 없는 경로도 가장 가까운 부모의 실경로로 확인한다. 심볼릭 링크로 저장소 안을 가리키는 경로도 거부한다.
async function canonical(file) {
  try { return await fs.realpath(file); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const parent = path.dirname(file);
    if (parent === file) throw e;
    return path.join(await canonical(parent), path.basename(file));
  }
}
async function validateOutput(output) {
  if (!output || !path.isAbsolute(output)) throw new Error('출력 폴더는 저장소 밖의 절대 경로여야 합니다.');
  const root = await fs.realpath(ROOT), dest = await canonical(path.resolve(output));
  if (inside(root, dest)) throw new Error('저장소 내부에는 출력할 수 없습니다.');
  try { if (!(await fs.stat(dest)).isDirectory()) throw new Error('출력 경로가 폴더가 아닙니다.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return dest;
}
function settings(env = process.env) {
  const positive = (key, fallback) => { const value = Number(env[key] ?? fallback); if (!Number.isFinite(value) || value <= 0) throw new Error(`${key}는 양수여야 합니다.`); return value; };
  const engine = env.E2E_BROWSER || 'chromium';
  if (!['chromium', 'webkit'].includes(engine)) throw new Error('E2E_BROWSER는 chromium 또는 webkit이어야 합니다.');
  return { engine, pace: positive('VIDEO_PACE', 1), scale: STAGE.scale, captions: env.VIDEO_CAPTIONS !== '0' };
}
// 녹화 덧층은 이 문서에만 둔다. 게임 문서에는 초기화 스크립트를 넣지 않는다.
function stageHTML() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<style>
*{box-sizing:border-box}html,body{margin:0;width:780px;height:1864px;overflow:hidden;background:#182235}
#content{width:390px;height:932px;transform:scale(2);transform-origin:0 0}
header{height:88px;padding:7px 16px;color:#fff;font-family:system-ui,sans-serif}
#title{font-size:12px;line-height:18px;color:#d2dded}
#caption{margin-top:3px;font-size:17px;font-weight:600;line-height:25px;height:50px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#game{display:block;width:390px;height:844px;border:0;background:#fff}
#finger,#ring{position:fixed;z-index:10;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%)}
#finger{left:${FINGER_HOME.x}px;top:${FINGER_HOME.y}px;opacity:0;width:56px;height:56px;border:6px solid #15233b;background:rgba(255,160,48,.68);box-shadow:0 0 0 4px rgba(255,255,255,.95)}
#finger.pressed{border-radius:16px;background:rgba(37,86,152,.72);transform:translate(-50%,-50%) scale(.88)}
#ring{width:56px;height:56px;border:6px solid #192e50;opacity:0}
</style></head><body><div id="content"><header><div id="title"></div><div id="caption" aria-live="polite"></div></header>
<iframe name="game" id="game" title="게임 화면"></iframe></div>
<div id="finger" aria-hidden="true"></div><div id="ring" aria-hidden="true"></div>
<script>
window.__videoTitle=text=>{document.getElementById('title').textContent=text;document.getElementById('game').title=text};
window.__videoCaption=text=>{document.getElementById('caption').textContent=text};
window.__videoFinger=({x,y,pressed,pulse,fade})=>{
 const finger=document.getElementById('finger'),ring=document.getElementById('ring');
 finger.getAnimations().forEach(a=>a.cancel());finger.style.opacity='1';
 finger.style.left=x+'px';finger.style.top=y+'px';finger.classList.toggle('pressed',pressed);
 if(fade&&!pressed)finger.animate([{opacity:1},{opacity:0}],{duration:${FINGER_FADE_MS},fill:'forwards'});
 if(pulse){ring.getAnimations().forEach(a=>a.cancel());ring.style.left=x+'px';ring.style.top=y+'px';
 ring.animate([{opacity:.95,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(2.8)'}],{duration:450})}
};
</script></body></html>`;
}
async function startServer() {
  const root = await fs.realpath(ROOT);
  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (pathname === STAGE_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : stageHTML()); return;
      }
      const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!inside(root, file) || !MIME[path.extname(file)] || !inside(root, await fs.realpath(file))) { res.writeHead(404); res.end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 400); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}

function randomFor(id) {
  let seed = Array.from(id).reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const slug = text => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 32) || '장면';
class Human {
  constructor(page, output, scene, config) {
    this.page = page; this.game = page.frame('game');
    if (!this.game) throw new Error('무대의 game iframe이 없습니다.');
    this.output = output; this.id = scene.id; this.config = config;
    this.started = performance.now(); this.scenes = []; this.failures = []; this.errors = []; this.result = {}; this.random = randomFor(scene.id); this.finger = { ...FINGER_HOME }; this.pressed = false;
  }
  elapsed() { return Math.round((performance.now() - this.started) / 10) / 100; }
  loc(selector) { return this.game.locator(selector); }
  async goto(file) {
    if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..') || /^[a-z]+:/i.test(file)) throw new Error('게임 경로는 저장소 기준 상대 경로여야 합니다.');
    await this.caption('게임 화면을 열어 보자.');
    await this.game.goto(new URL('/' + file, this.page.url()).href, { waitUntil: 'load' });
  }
  async think(ms) { await this.page.waitForTimeout(ms * this.config.pace); }
  async read(locator) {
    const count = await (locator || this.loc('body')).evaluateAll(els => {
      const visible = el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || s.visibility === 'hidden' || s.display === 'none' || el.closest('[hidden], [inert]')) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const style = getComputedStyle(p), box = p.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.bottom <= box.top || r.top >= box.bottom)) return false;
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.right <= box.left || r.left >= box.right)) return false;
        }
        return true;
      };
      const roots = els.filter(visible), found = new Set();
      for (const root of roots) { const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (walker.nextNode()) { const node = walker.currentNode; if (visible(node.parentElement) && node.textContent.trim()) found.add(node); } }
      const textCount = [...found].reduce((n, node) => n + Array.from(node.textContent.trim()).length, 0);
      const fields = new Set(roots.flatMap(root => [root, ...root.querySelectorAll('textarea, input')]).filter(el => el.matches('textarea, input') && visible(el)));
      return textCount + [...fields].reduce((n, el) => n + Array.from(el.value).length, 0);
    });
    await this.think(Math.min(4500, Math.max(1200, count * 40)));
  }
  async target(locator) {
    await locator.waitFor({ state: 'visible' });
    await locator.scrollIntoViewIfNeeded();
    if (await locator.isDisabled()) throw new Error(`탭 대상이 비활성입니다: ${await locator.textContent()}`);
    await locator.click({ trial: true });
    // iframe Locator의 boundingBox에는 무대 위치와 2배 변환이 이미 반영되어 있다.
    const box = await locator.boundingBox();
    if (!box) throw new Error('탭 대상의 위치를 읽지 못했습니다.');
    return {
      x: Math.max(2, Math.min(STAGE.width - 2, box.x + box.width / 2 + (this.random() - .5) * Math.min(6, box.width / 4))),
      y: Math.max(STAGE.band * STAGE.scale + 2, Math.min(STAGE.height - 2, box.y + box.height / 2 + (this.random() - .5) * Math.min(6, box.height / 4)))
    };
  }
  async point(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= STAGE.gameWidth || y < 0 || y >= STAGE.gameHeight) throw new Error('게임 좌표가 390×844 화면 밖입니다.');
    const box = await this.page.locator('#game').boundingBox();
    if (!box) throw new Error('게임 iframe의 무대 위치를 읽지 못했습니다.');
    return { x: box.x + STAGE.scale * x, y: box.y + STAGE.scale * y };
  }
  async showFinger(pulse = false, fade = false) {
    await this.page.evaluate(point => window.__videoFinger(point), { ...this.finger, pressed: this.pressed, pulse, fade });
  }
  async move(point, fast = false) {
    const from = this.finger, steps = fast ? 4 : 15;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      this.finger = { x: from.x + (point.x - from.x) * t, y: from.y + (point.y - from.y) * t };
      // iframe 위의 mousemove는 무대에 전달되지 않는다. 무대 함수로 직접 그린다.
      await this.showFinger(); await this.page.mouse.move(this.finger.x, this.finger.y);
      if (!fast) await this.think(22);
    }
    if (!fast) await this.think(120);
  }
  async press() {
    if (this.pressed) throw new Error('이미 손가락을 누르고 있습니다. 먼저 up()을 호출하세요.');
    this.pressed = true;
    try { await this.showFinger(true); await this.page.mouse.down(); }
    catch (e) { this.pressed = false; await this.showFinger(false, true).catch(() => {}); throw e; }
  }
  async up() {
    try { await this.page.mouse.up(); }
    finally { this.pressed = false; await this.showFinger(false, true); }
  }
  async tapPoint(point, { fast = false } = {}) {
    await this.move(point, fast); await this.press();
    try { if (!fast) await this.think(70); } finally { await this.up(); }
    if (!fast) await this.think(180);
  }
  async tap(locator, options = {}) { await this.tapPoint(await this.target(locator), options); }
  async tapAt(x, y, options = {}) { await this.tapPoint(await this.point(x, y), options); }
  async down(target) {
    const point = typeof target?.x === 'number' ? await this.point(target.x, target.y) : await this.target(target);
    await this.move(point); await this.press();
  }
  async key(key) { await this.page.locator('#game').focus(); await this.page.keyboard.press(key); }
  async type(locator, text) {
    await this.tap(locator);
    for (const char of Array.from(text)) { await this.page.keyboard.insertText(char); await this.think(110); }
  }
  async caption(text) { this.captionText = this.config.captions ? text : ''; await this.page.evaluate(text => window.__videoCaption(text), this.captionText); }
  async mark(scene) {
    const entry = { t: this.elapsed(), scene, caption: this.captionText || '', screenshot: `${this.id}-${String(this.scenes.length + 1).padStart(2, '0')}-${slug(scene)}.png` };
    this.scenes.push(entry); await this.page.screenshot({ path: path.join(this.output, entry.screenshot), fullPage: false }); return entry;
  }
  fail(scene, error) { const entry = { t: this.elapsed(), scene, message: `FAIL: ${error.message || error}` }; this.failures.push(entry); console.error(`${this.id}: ${entry.message}`); }
  async step(scene, action) {
    // 새 자막을 걸 때까지 앞 자막을 유지한다. 입력·이동 대기 중에도 빈 띠가 남지 않는다.
    try { if (!this.captionText) await this.caption('화면을 살펴보고 이어서 해 보자.'); await action(); await this.mark(scene); return true; }
    catch (e) { if (this.pressed) await this.up().catch(() => {}); this.fail(scene, e); await this.caption('잠깐, 여기서 막혔다.').catch(() => {}); await this.mark(`FAIL-${scene}`).catch(e => this.fail('실패 사진', e)); return false; }
  }
  expect(condition, message) { if (!condition) throw new Error(message); }
  async intro({ readGame = true } = {}) {
    await this.caption('어떤 규칙인지 차근차근 읽어 보자.');
    await this.read(this.loc('#overlay .card'));
    await this.mark('소개');
    // 긴 규칙 카드는 실제로 아래까지 스크롤하며 읽는다.
    for (const rule of await this.loc('#overlay .rules > li').all()) { await rule.evaluate(el => el.scrollIntoView({ block: 'center' })); await this.read(rule); }
    await this.caption('규칙을 읽었다. 한번 해 보자.'); await this.tap(this.loc('#ar-start'));
    if (readGame) await this.read();
  }
  async finish(answer) {
    await this.loc('#ar-retry').waitFor({ state: 'visible' });
    this.result.reachedResult = true;
    this.result.text = await this.loc('#overlay .card').innerText();
    await this.caption('결과를 보니 헷갈린 데가 보인다.'); await this.read(this.loc('#overlay .card')); await this.mark('결과');
    // 공통 문항(data-i)과 추가 흐름 문항(data-i 또는 data-flow)을 차례로 푼다.
    // 답하면 보기가 비활성화된다. 매번 다시 찾아 뒤늦게 붙는 문항도 처리한다.
    const quizzes = this.loc('#overlay .quiz, #overlay .flow-quiz');
    let answered = 0;
    while (true) {
      const index = await quizzes.evaluateAll(els => els.findIndex(el => el.querySelector('button[data-i]:not(:disabled), button[data-flow]:not(:disabled)')));
      if (index < 0) break;
      const quiz = quizzes.nth(index), choices = quiz.locator('button[data-i]:not(:disabled), button[data-flow]:not(:disabled)');
      const firstOption = quiz.locator('button[data-i="0"]:not(:disabled), button[data-flow="0"]:not(:disabled)');
      await this.caption(answered ? '이어서 묻는 내용도 떠올려 보자.' : '한 번 더 떠올려 보자.');
      await this.read(quiz); await this.tap(await firstOption.count() ? firstOption.first() : choices.first());
      this.expect(await choices.count() === 0, '답을 골랐지만 결과 문항이 끝나지 않았습니다.');
      await this.read(quiz.locator('.quiz-fb, .flow-fb')); await this.mark(`다시-떠올리기-${++answered}`);
    }
    this.result.answeredQuizzes = answered;
    if (answer !== undefined) await this.loc('#ar-refl').waitFor({ state: 'visible' });
    if (await this.loc('#ar-refl').count()) {
      await this.caption('내가 이해한 만큼 써 보자.');
      await this.loc('.refl').evaluate(el => el.scrollIntoView({ block: 'center' })); await this.read(this.loc('.refl'));
      await this.type(this.loc('#ar-refl'), answer); await this.think(1300); await this.mark('설명해-보기');
    }
    const hub = this.loc('#ar-hub');
    if (await hub.count() && await hub.isVisible()) {
      await this.caption('오늘 한 게임을 정리하고 돌아가자.'); await this.tap(hub); await this.loc('#cabinets').waitFor({ state: 'visible' });
      await this.caption('다음엔 무엇을 해 볼까.'); await this.read(this.loc('#summary')); await this.mark('허브-복귀');
      this.result.returnedHub = true;
    }
  }
}

module.exports = { ROOT, ORDER, STAGE, STAGE_PATH, validateOutput, settings, startServer, stageHTML, Human };
