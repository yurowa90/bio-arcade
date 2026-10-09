'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ORDER, STAGE, STAGE_PATH, validateOutput, settings, startServer, Human } = require('./common');

async function main(args = process.argv.slice(2)) {
  let output, config, scenes;
  try {
    output = await validateOutput(args[0]); config = settings(); scenes = [];
    const ids = args.slice(1).length ? args.slice(1) : ORDER;
    for (const id of ids) {
      if (!ORDER.includes(id)) throw new Error(`알 수 없는 게임 id: ${id}`);
      const file = path.join(__dirname, 'scenes', id + '.js');
      try { await fs.access(file); } catch (e) { if (e.code !== 'ENOENT') throw e; console.log(`${id}: 건너뜀 (장면 파일 없음)`); continue; }
      const scene = require(file);
      if (scene.id !== id || typeof scene.title !== 'string' || typeof scene.path !== 'string' || typeof scene.play !== 'function') throw new Error(`장면 모듈 형식 오류: ${id}`);
      scenes.push(scene);
    }
    if (new Set(ids).size !== ids.length) throw new Error('게임 id를 중복 지정할 수 없습니다.');
    await fs.mkdir(output, { recursive: true });
    // 기존 영상과 로그는 덮어쓰지 않는다. 새 출력 폴더로 실행한다.
    const protectedNames = ['summary.json', ...scenes.flatMap((scene, i) => [`${scene.id}-log.json`, `${String(i + 1).padStart(2, '0')}-${scene.id}.webm`])];
    for (const name of protectedNames) {
      try { await fs.access(path.join(output, name)); throw new Error(`기존 결과물이 있습니다: ${name}. 다른 출력 폴더를 지정하세요.`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  } catch (e) { console.error(e.message); return 2; }

  const summary = { engine: config.engine, pace: config.pace, scale: config.scale, captions: config.captions, games: [], skipped: (args.slice(1).length ? args.slice(1) : ORDER).filter(id => !scenes.some(s => s.id === id)) };
  if (!scenes.length) { await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n'); return 0; }
  let server, browser, setupError;
  try {
    try {
      const pw = require(process.env.PW || 'playwright');
      server = await startServer(); browser = await pw[config.engine].launch({ headless: true });
    } catch (e) { setupError = e; }
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]; let context, page, h, video, durationSec;
      const name = `${String(i + 1).padStart(2, '0')}-${scene.id}.webm`;
      const size = { width: STAGE.width, height: STAGE.height };
      const videoInfo = { method: 'playwright', file: name, ...size, saved: false };
      const fallback = { id: scene.id, title: scene.title, engine: config.engine, durationSec: 0, video: videoInfo, scenes: [], failures: [], errors: [], result: {} };
      try {
        if (setupError) throw setupError;
        // CSS로 2배 확대한 무대와 녹화 크기를 같게 한다.
        const options = { viewport: size, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'ko-KR', reducedMotion: 'no-preference',
          recordVideo: { dir: path.join(output, '_video'), size } };
        context = await browser.newContext(options);
        page = await context.newPage(); page.setDefaultTimeout(7000); page.setDefaultNavigationTimeout(15000);
        video = page.video();
        if (!video) throw new Error('Playwright 녹화가 준비되지 않았습니다.');
        const error = (kind, message) => fallback.errors.push({ t: h ? h.elapsed() : 0, kind, message });
        // Page 이벤트는 자식 iframe의 콘솔·예외·요청도 받는다.
        page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) error('console-' + msg.type(), msg.text()); });
        page.on('pageerror', e => error('pageerror', e.message));
        page.on('requestfailed', req => error('requestfailed', `${req.method()} ${req.url()}: ${req.failure()?.errorText}`));
        page.on('response', res => { if (res.status() >= 400) error('response', `${res.status()} ${res.url()}`); });
        // 확인 창은 iframe의 실행도 막는다. 문구를 기록하고 읽을 시간을 둔 뒤 취소한다.
        page.on('dialog', async dialog => {
          const result = h ? h.result : fallback.result;
          const entry = { t: h ? h.elapsed() : 0, type: dialog.type(), message: dialog.message(), action: 'dismiss' };
          (result.dialogs ||= []).push(entry);
          const readMs = Math.min(4500, Math.max(1200, Array.from(dialog.message()).length * 40));
          await new Promise(resolve => setTimeout(resolve, readMs * config.pace));
          try { await dialog.dismiss(); entry.dismissedAt = h ? h.elapsed() : 0; } catch (e) { error('dialog', e.message); }
        });
        await page.goto(`${server.url}${STAGE_PATH}`, { waitUntil: 'load' });
        await page.evaluate(title => window.__videoTitle(title), scene.title);
        h = new Human(page, output, scene, config); h.errors = fallback.errors;
        await h.step('페이지-열기', () => h.goto(scene.path));
        await scene.play(h);
      } catch (e) { if (h) { h.fail('게임-실행', e); await h.mark('FAIL-게임-실행').catch(() => {}); } else fallback.failures.push({ t: 0, scene: '준비', message: `FAIL: ${e.message}` }); }
      finally {
        durationSec = h ? h.elapsed() : 0;
        if (h?.pressed) await h.up().catch(e => h.fail('손가락-떼기', e));
        if (context) try { await context.close(); } catch (e) { if (h) h.fail('문맥-닫기', e); else fallback.failures.push({ t: 0, scene: '문맥-닫기', message: `FAIL: ${e.message}` }); }
        if (video) try {
          await fs.rename(await video.path(), path.join(output, name));
          videoInfo.saved = true; if (h) h.result.video = name;
        } catch (e) { if (h) h.fail('영상-저장', e); else fallback.failures.push({ t: 0, scene: '영상-저장', message: `FAIL: ${e.message}` }); }
      }
      const log = h ? { ...fallback, durationSec, scenes: h.scenes, failures: h.failures, errors: h.errors, result: h.result } : fallback;
      // 목표 길이 이탈도 기록해 총괄이 실제 영상으로 속도를 조정할 수 있게 한다.
      log.result.paceOneDurationSec = Math.round(log.durationSec / config.pace);
      log.result.durationInTarget = log.result.paceOneDurationSec >= (['hub', 'organization'].includes(scene.id) ? 60 : 90) && log.result.paceOneDurationSec <= 210;
      await fs.writeFile(path.join(output, `${scene.id}-log.json`), JSON.stringify(log, null, 2) + '\n');
      summary.games.push(log);
      console.log(`${scene.id}: ${log.durationSec}초 · 장면 ${log.scenes.length} · FAIL ${log.failures.length} · 오류 ${log.errors.length} · 결과 ${log.result.reachedResult ? '도달' : scene.id === 'hub' && log.result.completed ? '확인' : '미도달'}`);
      await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    }
  } finally {
    if (browser) await browser.close().catch(e => { summary.cleanupError = e.message; });
    if (server) await server.close().catch(e => { summary.cleanupError = e.message; });
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  return summary.cleanupError || summary.games.some(g => g.failures.length || g.errors.length) ? 1 : 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(e => { console.error(`FAIL: ${e.stack}`); process.exitCode = 1; });
module.exports = { main };
