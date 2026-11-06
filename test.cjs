const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'index.html') + '#dev';
const OUT = path.resolve(__dirname, 'qa');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const log = o => console.log(JSON.stringify(o));

// 在测试侧独立实现一次 BFS 导航：只根据页面导出的关卡数据 + 实时状态
function planStep(st, levels) {
  const L = levels[st.floor];
  const grid = l => (l === 'A' ? L.A : L.B).map(r => r.split(''));
  const gA = grid('A'), gB = grid('B');
  const solid = c => c === '#' || c === '~';
  const pass = (g, x, y, keys) => {
    const c = g[y][x];
    if (c === '#' || c === '~') return false;
    if (c === 'D') return keys > 0;
    return true;
  };
  const W = 15, H = 13;
  const start = [st.x, st.y, st.layer, st.keys];
  const seen = new Set([start.join('|')]);
  const q = [start];
  const parent = new Map();
  let goal = null;
  while (q.length) {
    const [x, y, lay, keys] = q.shift();
    if ((lay === 'A' ? gA : gB)[y][x] === 'X') { goal = [x, y, lay, keys]; break; }
    const g = lay === 'A' ? gA : gB;
    const moves = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const c = g[ny][nx];
      if (c === 'D') {
        if (keys > 0) moves.push([nx, ny, lay, keys - 1]);
      } else if (!solid(c)) {
        moves.push([nx, ny, lay, keys]);
      }
    }
    const og = lay === 'A' ? gB : gA;
    const other = lay === 'A' ? 'B' : 'A';
    if (pass(og, x, y, keys)) moves.push([x, y, other, keys]);
    // 站在钥匙格上视为已拾取（规划用，最多算 3 把）
    if (g[y][x] === 'K' && keys < 3) {
      for (let i = 0; i < moves.length; i++) moves[i][3] = keys + 1;
    }
    for (const m of moves) {
      const k = m.join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      parent.set(k, [x, y, lay, keys].join('|'));
      q.push(m);
    }
  }
  if (!goal) return null;
  let cur = goal.join('|');
  const pathKeys = [];
  while (cur && cur !== start.join('|')) {
    pathKeys.push(cur.split('|'));
    cur = parent.get(cur);
  }
  pathKeys.reverse();
  const first = pathKeys.length >= 1 ? pathKeys[0] : null;   // 回溯时不包含起点，[0] 即第一步
  if (!first) return null;
  const nx = +first[0], ny = +first[1], nl = first[2];
  if (nl !== st.layer) return { type: 'fold' };
  return { type: 'move', dx: nx - st.x, dy: ny - st.y };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 749, height: 827 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const canvasInk = await page.evaluate(() => {
    const cv = document.getElementById('cv');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 211) if (d[i] + d[i + 1] + d[i + 2] > 40) n++;
    return n;
  });
  log({ step: 'boot', devApi: await page.evaluate(() => !!window.__FD && typeof window.__FD.move === 'function'), ink: canvasInk });

  await page.click('#btnStart');
  await page.waitForTimeout(700);
  let st = await page.evaluate(() => window.__FD.state());
  log({ step: 'start', floor: st.floor, layer: st.layer, x: st.x, y: st.y, hp: st.hp, enemies: st.enemies.length, lit: st.litCount });

  // 方向键 UI 接线
  await page.click('.dbtn[data-dir="down"]');
  await page.waitForTimeout(140);
  const afterBtn = await page.evaluate(() => window.__FD.state());
  log({ step: 'dpad-button', y0: st.y, y1: afterBtn.y, ok: afterBtn.y === st.y + 1 });

  // 撞墙不移动
  await page.evaluate(() => { window.__FD.jump(0); });
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__FD.move(-1, 0));
  const wallState = await page.evaluate(() => window.__FD.state());
  log({ step: 'wall-block', x: wallState.x, ok: wallState.x === 1 });

  // 走到断口处（x=5,y=6），右移应被墙/虚空挡住
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.__FD.move(0, 1)); await page.waitForTimeout(60); }
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__FD.move(1, 0)); await page.waitForTimeout(60); }
  const beforeGap = await page.evaluate(() => window.__FD.state());
  await page.evaluate(() => window.__FD.move(1, 0));
  await page.waitForTimeout(120);
  const gapState = await page.evaluate(() => window.__FD.state());
  log({ step: 'gap-blocked', pos: [beforeGap.x, beforeGap.y], after: [gapState.x, gapState.y], ok: gapState.x === beforeGap.x });

  // 折叠
  const canFold = await page.evaluate(() => window.__FD.canFold());
  await page.evaluate(() => window.__FD.fold());
  await page.waitForTimeout(420);
  const folded = await page.evaluate(() => window.__FD.state());
  log({ step: 'fold', canFold, layer: folded.layer, folds: folded.folds, ok: canFold && folded.layer === 'B' });

  // 折叠后继续右移应可通过
  await page.evaluate(() => window.__FD.move(1, 0));
  await page.waitForTimeout(140);
  const crossed = await page.evaluate(() => window.__FD.state());
  log({ step: 'cross-after-fold', x: crossed.x, ok: crossed.x === beforeGap.x + 1 });

  // 死亡流程
  await page.evaluate(() => window.__FD.hurt(99));
  await page.waitForTimeout(700);
  const deadState = await page.evaluate(() => window.__FD.state());
  const deathVisible = await page.isVisible('#scrDeath');
  log({ step: 'death', dead: deadState.dead, screen: deathVisible, ok: deadState.dead && deathVisible });
  await page.click('#btnRetry');
  await page.waitForTimeout(400);
  const revived = await page.evaluate(() => window.__FD.state());
  log({ step: 'retry', dead: revived.dead, hp: revived.hp, floor: revived.floor, x: revived.x, ok: !revived.dead && revived.hp === 6 && revived.x === 1 });

  // 全流程自动通关（每步重规划，遇到敌人就撞上去攻击）
  await page.evaluate(() => { window.__FD.jump(0); });
  await page.waitForTimeout(200);

  const levels = await page.evaluate(() => window.__FD.levels);
  let steps = 0, foldsDone = 0, maxSteps = 900, lastFloor = 0, minHp = 6;
  const trail = [];
  while (steps++ < maxSteps) {
    const s = await page.evaluate(() => window.__FD.state());
    if (s.hp < minHp) minHp = s.hp;
    if (s.won) break;
    if (s.dead) { log({ step: 'playthrough', died: true, atFloor: s.floor, steps }); break; }
    if (s.floor !== lastFloor) { trail.push('F' + (s.floor + 1)); lastFloor = s.floor; }
    if (s.busy) { await page.waitForTimeout(60); continue; }
    const act = planStep(s, levels);
    if (!act) { log({ step: 'playthrough', noPath: true, floor: s.floor, x: s.x, y: s.y, layer: s.layer, keys: s.keys }); break; }
    if (act.type === 'fold') { foldsDone++; await page.evaluate(() => window.__FD.fold()); await page.waitForTimeout(330); }
    else { await page.evaluate(([dx, dy]) => window.__FD.move(dx, dy), [act.dx, act.dy]); await page.waitForTimeout(120); }
  }
  await page.waitForTimeout(700);
  const final = await page.evaluate(() => window.__FD.state());
  const winVisible = await page.isVisible('#scrWin');
  log({
    step: 'playthrough', won: final.won, screen: winVisible, floor: final.floor,
    steps, folds: foldsDone, trail, hp: final.hp, atk: final.atk, keys: final.keys,
    bossAlive: final.enemies.some(e => e.type === 'boss'),
    minHp
  });
  await page.screenshot({ path: path.join(OUT, 'shot-win.png') });

  // 布局与截图（回到游戏内）
  await page.click('#btnAgain');
  await page.waitForTimeout(500);
  for (const v of [{ n: 'unfolded', w: 749, h: 827 }, { n: 'landscape', w: 827, h: 749 }, { n: 'cover', w: 400, h: 860 }, { n: 'small', w: 360, h: 640 }]) {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.waitForTimeout(320);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const deck = document.getElementById('deck').getBoundingClientRect();
      const stage = document.getElementById('stage').getBoundingClientRect();
      const over = [];
      document.querySelectorAll('#deck *, #hud *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        if (r.right > innerWidth + 0.6 || r.left < -0.6 || r.bottom > innerHeight + 0.6) over.push(el.className || el.id);
      });
      return {
        vw: innerWidth, vh: innerHeight, overflowX: de.scrollWidth - innerWidth,
        stageH: Math.round(stage.height), deckTop: Math.round(deck.top), deckBottom: Math.round(deck.bottom),
        over: over.slice(0, 5)
      };
    });
    log({ step: 'layout', name: v.n, ...m });
    await page.screenshot({ path: path.join(OUT, 'shot-' + v.n + '.png') });
  }

  log({ step: 'errors', count: errors.length, list: errors.slice(0, 6) });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
