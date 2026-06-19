/* ============ 西高地勇闯万象城 · DOM 界面 & 桥接 ============ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SFX = window.SFX;
  let bus = null, started = false;

  const BASE_SCREENS = ['screen-loading', 'screen-menu'];
  const OVERLAYS = ['screen-howto', 'screen-pause', 'screen-over'];

  function setBase(id) { BASE_SCREENS.forEach((s) => $(s).classList.toggle('active', s === id)); }
  function overlay(id, on) { $(id).classList.toggle('active', !!on); }
  function closeOverlays() { OVERLAYS.forEach((s) => $(s).classList.remove('active')); }
  function hud(on) { $('hud').classList.toggle('hidden', !on); }

  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }

  function renderHearts(n) {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<span style="opacity:${i < n ? 1 : 0.28}">${i < n ? '❤️' : '🤍'}</span>`;
    $('hud-hearts').innerHTML = s;
  }

  /* ---------- 音效 / 静音 ---------- */
  function loadMuted() { return localStorage.getItem('westie_muted') === '1'; }
  function applyMute(m) {
    SFX && SFX.setMuted(m);
    localStorage.setItem('westie_muted', m ? '1' : '0');
    const label = m ? '🔇' : '🔊';
    $('btn-mute').textContent = label;
    $('btn-mute-game').textContent = label;
  }

  /* ---------- 全屏 ---------- */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    const fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    if (fsEl) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (isIOS && !isStandalone) {
      toast('iPhone 真全屏：点 Safari 底部「分享」→「添加到主屏幕」，再从桌面图标打开即全屏无地址栏 🐾', 5200);
    } else {
      toast('当前浏览器不支持全屏 API');
    }
  }

  /* ---------- 分享 ---------- */
  function doShare(score) {
    const url = location.href.split('#')[0];
    const text = (score != null)
      ? `我在《西高地勇闯万象城》拿了 ${score} 分！🐕 你能超过我吗？`
      : '《西高地勇闯万象城》超萌皮克斯风跑酷，点开即玩！🐕🛍️';
    if (navigator.share) {
      navigator.share({ title: '西高地勇闯万象城', text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + ' ' + url).then(() => toast('链接已复制，快发给朋友！')).catch(() => toast(url));
    } else { toast(url, 5000); }
  }

  /* ---------- 加载提示轮播 ---------- */
  const TIPS = ['正在唤醒小西高地…', '给购物车装上轮子…', '挂好万象城的彩旗…', '把金币擦得锃亮…', '准备出发！'];
  let tipI = 0;
  function rotateTips() { $('loading-tip').textContent = TIPS[tipI % TIPS.length]; tipI++; }

  /* ---------- 游戏控制 ---------- */
  function startGame() {
    SFX && SFX.resume();
    closeOverlays(); setBase(''); hud(true);
    bus.emit('cmd-start');
  }
  function toMenu() {
    closeOverlays(); hud(false); setBase('screen-menu');
    SFX && SFX.stopMusic();
    bus.emit('cmd-menu');
  }

  /* ---------- 启动 ---------- */
  function init() {
    const game = window.WestieGame.boot('game-root');
    bus = window.WestieGame.bus;

    $('hero-img').src = 'assets/title_hero.webp';
    applyMute(loadMuted());
    if (isStandalone) $('btn-fullscreen').style.display = 'none';

    const tipTimer = setInterval(rotateTips, 1200);

    // —— 总线事件 ——
    bus.on('loadprogress', (p) => { $('progress-bar').style.width = Math.round(p * 100) + '%'; });
    bus.on('ready', () => {
      $('progress-bar').style.width = '100%';
      clearInterval(tipTimer);
      setTimeout(() => { setBase('screen-menu'); hud(false); }, 350);
    });
    bus.on('best', (b) => { $('menu-best').textContent = b; });
    bus.on('hud', (d) => {
      $('hud-score').textContent = d.score;
      $('hud-coins').textContent = d.coins;
      renderHearts(d.hearts);
    });
    bus.on('combo', (d) => {
      const el = $('combo-pop');
      el.textContent = `连击 x${d.mult}!`;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    });
    bus.on('req-pause', () => { if (!$('hud').classList.contains('hidden')) bus.emit('cmd-pause'); });
    bus.on('state', (s) => {
      if (s === 'paused') overlay('screen-pause', true);
      if (s === 'running') closeOverlays();
    });
    bus.on('gameover', (d) => {
      hud(false);
      $('over-score').textContent = d.score;
      $('over-best').textContent = d.best;
      $('over-coins').textContent = '🪙 ' + d.coins;
      $('over-dist').textContent = d.distance + 'm';
      $('new-best-badge').classList.toggle('hidden', !d.newBest);
      $('over-title').textContent = d.newBest ? '太厉害啦！' : pickOverTitle(d.score);
      $('btn-share-over').onclick = () => { SFX && SFX.button(); doShare(d.score); };
      overlay('screen-over', true);
    });

    // —— 按钮 ——
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); SFX && SFX.button(); fn(); });
    click('btn-play', startGame);
    click('btn-replay', () => { closeOverlays(); hud(true); bus.emit('cmd-restart'); });
    click('btn-pause', () => bus.emit('cmd-pause'));
    click('btn-resume', () => { overlay('screen-pause', false); bus.emit('cmd-resume'); });
    click('btn-restart-pause', () => { closeOverlays(); hud(true); bus.emit('cmd-restart'); });
    click('btn-menu-pause', toMenu);
    click('btn-menu-over', toMenu);
    click('btn-howto', () => overlay('screen-howto', true));
    document.querySelector('.close-howto').addEventListener('click', () => { SFX && SFX.button(); overlay('screen-howto', false); });
    click('btn-fullscreen', toggleFullscreen);
    click('btn-share-menu', () => doShare(null));
    $('btn-mute').addEventListener('click', () => { SFX && SFX.resume(); applyMute(!SFX.muted); });
    $('btn-mute-game').addEventListener('click', () => { SFX && SFX.resume(); applyMute(!SFX.muted); });

    // 首次手势恢复音频上下文（iOS 必需）
    const unlock = () => { SFX && SFX.resume(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock, { once: true });

    // Service Worker（离线可玩）
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  function pickOverTitle(score) {
    if (score < 200) return '再逛逛嘛~';
    if (score < 800) return '这趟逛得不错！';
    if (score < 2000) return '购物达人！';
    return '万象城传奇！';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
