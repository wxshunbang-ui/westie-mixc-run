/* ============ 西高地勇闯万象城 · 游戏核心 (Phaser 3) ============ */
(function (global) {
  'use strict';

  const BASE = 'assets/';
  const bus = new Phaser.Events.EventEmitter();

  const IMAGES = {
    westie_run: 'westie_run.webp',
    westie_run2: 'westie_run2.webp',
    westie_jump: 'westie_jump.webp',
    item_bone: 'item_bone.webp',
    item_bag: 'item_bag.webp',
    item_coffee: 'item_coffee.webp',
    item_toy: 'item_toy.webp',
    coin: 'coin.webp',
    obs_cart: 'obs_cart.webp',
    obs_cone: 'obs_cone.webp',
    obs_box: 'obs_box.webp',
    prop_plant: 'prop_plant.webp',
    prop_balloons: 'prop_balloons.webp',
    bg_street: 'bg_street.webp',
    bg_ground: 'bg_ground.webp',
  };

  const ITEM_KEYS = ['item_bone', 'item_bag', 'item_coffee', 'item_toy'];
  const OBS_KEYS = ['obs_cart', 'obs_cone', 'obs_box'];
  const BEST_KEY = 'westie_best';

  /* ---------------- 加载场景 ---------------- */
  class PreloadScene extends Phaser.Scene {
    constructor() { super('preload'); }
    preload() {
      Object.entries(IMAGES).forEach(([k, f]) => this.load.image(k, BASE + f));
      this.load.on('progress', (p) => bus.emit('loadprogress', p));
    }
    create() {
      makeRuntimeTextures(this);
      // 跑步动画：两帧腿部循环
      this.anims.create({
        key: 'run',
        frames: [{ key: 'westie_run' }, { key: 'westie_run2' }],
        frameRate: 11, repeat: -1,
      });
      this.scene.start('play');
      bus.emit('ready');
    }
  }

  /* 运行期生成粒子贴图（无需外部文件） */
  function makeRuntimeTextures(scene) {
    const mk = (key, inner) => {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      inner(g);
      g.generateTexture(key, 32, 32);
      g.destroy();
    };
    mk('p_spark', (g) => { g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 7); g.fillStyle(0xffffff, 0.35); g.fillCircle(16, 16, 14); });
    mk('p_soft', (g) => { for (let r = 14; r > 0; r--) { g.fillStyle(0xffffff, 0.06); g.fillCircle(16, 16, r); } });
  }

  /* ---------------- 主游戏场景 ---------------- */
  class PlayScene extends Phaser.Scene {
    constructor() { super('play'); }

    create() {
      const { width: W, height: H } = this.scale;

      // —— 视差层 ——
      this.bgFar = this.add.tileSprite(0, 0, W, H, 'bg_street').setOrigin(0, 0).setDepth(0);
      this.fitTile(this.bgFar, 'bg_street', 'cover');
      this.midProps = this.add.group();
      this.ground = this.add.tileSprite(0, 0, W, 200, 'bg_ground').setOrigin(0, 1).setDepth(10);

      // —— 暗角 + 顶部柔光（氛围）——
      this.vig = this.add.graphics().setDepth(60).setScrollFactor(0);

      // —— 主角 ——
      this.dog = this.add.sprite(0, 0, 'westie_run').setDepth(20);
      this.dog.setOrigin(0.5, 1);

      // —— 对象容器 ——
      this.obstacles = [];
      this.collectibles = [];
      this.floaters = this.add.group();

      // —— 粒子 ——
      this.dust = this.add.particles(0, 0, 'p_soft', {
        speed: { min: 30, max: 90 }, angle: { min: 200, max: 340 }, scale: { start: 0.7, end: 0 },
        alpha: { start: 0.7, end: 0 }, lifespan: 500, tint: 0xe9d4b0, emitting: false,
      }).setDepth(18);
      this.sparks = this.add.particles(0, 0, 'p_spark', {
        speed: { min: 80, max: 260 }, scale: { start: 0.8, end: 0 }, lifespan: 600,
        alpha: { start: 1, end: 0 }, tint: [0xffe27a, 0xffd24a, 0xffffff], emitting: false, blendMode: 'ADD',
      }).setDepth(26);
      this.burst = this.add.particles(0, 0, 'p_spark', {
        speed: { min: 120, max: 340 }, scale: { start: 1, end: 0 }, lifespan: 700,
        alpha: { start: 1, end: 0 }, tint: [0xff6b6b, 0xffffff, 0xffd24a], emitting: false, blendMode: 'ADD',
      }).setDepth(27);

      // —— 状态 ——
      this.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
      this.layout();
      this.resetVars();
      this.enterIdle();

      // —— 输入 ——
      this.input.on('pointerdown', () => this.onDown());
      this.input.on('pointerup', () => this.onUp());
      this.input.keyboard.on('keydown-SPACE', () => this.onDown());
      this.input.keyboard.on('keydown-UP', () => this.onDown());
      this.input.keyboard.on('keyup-SPACE', () => this.onUp());
      this.input.keyboard.on('keyup-UP', () => this.onUp());
      this.input.keyboard.on('keydown-P', () => bus.emit('req-pause'));
      this.input.keyboard.on('keydown-ESC', () => bus.emit('req-pause'));

      // —— 来自 DOM 的指令 ——
      bus.on('cmd-start', () => this.startRun(), this);
      bus.on('cmd-restart', () => this.startRun(), this);
      bus.on('cmd-pause', () => this.pauseGame(), this);
      bus.on('cmd-resume', () => this.resumeGame(), this);
      bus.on('cmd-menu', () => this.enterIdle(), this);

      this.scale.on('resize', () => this.layout(), this);
      bus.emit('best', this.best);
      if (location.search.indexOf('debug') >= 0) global.__scene = this;
    }

    /* 适配尺寸 / 物理常量 */
    layout() {
      const W = this.scale.width, H = this.scale.height;
      this.W = W; this.H = H;
      this.groundH = Phaser.Math.Clamp(H * 0.17, 92, 210);
      this.feetY = H - this.groundH * 0.46;

      this.fitTile(this.bgFar, 'bg_street', 'cover');

      this.ground.setSize(W, this.groundH);
      this.ground.setPosition(0, H);
      const gt = this.textures.get('bg_ground').getSourceImage();
      this.ground.tileScaleY = this.groundH / gt.height;
      this.ground.tileScaleX = this.ground.tileScaleY;

      // 主角尺寸
      const dogH = Phaser.Math.Clamp(H * 0.20, 78, 168);
      const dr = this.textures.get('westie_run').getSourceImage();
      this.dogScale = dogH / dr.height;
      this.dog.setScale(this.dogScale);
      this.dogX = W * 0.22;
      this.dog.x = this.dogX;
      if (this.grounded !== false) this.dog.y = this.feetY;

      // 物理
      this.gravity = H * 5.0;
      this.jumpV = Math.sqrt(2 * this.gravity * H * 0.32);
      this.jumpV2 = this.jumpV * 0.92;

      // 速度（按宽度归一，保证不同屏体验一致）
      this.baseSpeed = W * 0.46;
      this.maxSpeed = W * 1.05;

      this.drawVignette();
    }

    fitTile(tile, key, mode) {
      const img = this.textures.get(key).getSourceImage();
      const W = this.scale.width, H = this.scale.height;
      const s = mode === 'cover' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height);
      tile.setSize(W, H);
      tile.tileScaleX = s; tile.tileScaleY = s;
      tile.setPosition(0, 0);
    }

    drawVignette() {
      const W = this.W, H = this.H;
      this.vig.clear();
      // 底部柔和阴影 + 四角压暗
      this.vig.fillStyle(0x2a1c10, 0.16);
      this.vig.fillRect(0, H - this.groundH * 0.5, W, this.groundH * 0.5);
      const edge = Math.min(W, H) * 0.5;
      this.vig.fillStyle(0x000000, 0.0);
    }

    resetVars() {
      this.state = 'idle';
      this.speed = this.baseSpeed;
      this.distNorm = 0;
      this.scoreF = 0;
      this.coins = 0;
      this.hearts = 3;
      this.combo = 0;
      this.comboExpire = 0;
      this.invincibleUntil = 0;
      this.vy = 0;
      this.grounded = true;
      this.jumps = 0;
      this.spawnAcc = 0;
      this.nextSpawnGap = 520;
      this.lastHudScore = -1; this.lastHudCoins = -1; this.lastHudHearts = -1;
      this.midAcc = 0;
    }

    enterIdle() {
      this.clearField();
      this.resetVars();
      this.dog.setTexture('westie_run').play('run');
      this.dog.anims.timeScale = 0.7;
      this.dog.setAlpha(1).setScale(this.dogScale).setAngle(0);
      this.dog.x = this.dogX; this.dog.y = this.feetY;
      this.speed = this.baseSpeed * 0.45; // 待机时缓慢飘动
      this.state = 'idle';
      bus.emit('state', 'idle');
    }

    startRun() {
      this.clearField();
      this.resetVars();
      this.dog.setTexture('westie_run').play('run');
      this.dog.anims.timeScale = 1;
      this.dog.setAlpha(1).setAngle(0);
      this.state = 'running';
      this.patternCount = 0;
      this.spawnAcc = 0;
      this.nextSpawnGap = this.baseSpeed * 1.2; // 开局缓冲，给反应时间
      this.startTime = this.time.now;
      if (global.SFX) { global.SFX.resume(); global.SFX.startMusic(); }
      bus.emit('state', 'running');
      this.emitHud(true);
    }

    pauseGame() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.dog.anims.pause();
      if (global.SFX) global.SFX.stopMusic();
      bus.emit('state', 'paused');
    }
    resumeGame() {
      if (this.state !== 'paused') return;
      this.state = 'running';
      this.dog.anims.resume();
      if (global.SFX) global.SFX.startMusic();
      bus.emit('state', 'running');
    }

    clearField() {
      this.obstacles.forEach(o => o.destroy());
      this.collectibles.forEach(c => c.destroy());
      this.obstacles = []; this.collectibles = [];
      this.midProps.clear(true, true);
      this.floaters.clear(true, true);
    }

    /* ---------- 输入 ---------- */
    onDown() {
      if (this.state === 'idle') { bus.emit('tap-idle'); return; }
      if (this.state !== 'running') return;
      this.jump();
    }
    onUp() {
      if (this.state === 'running' && this.vy < 0) this.vy *= 0.45; // 可变跳跃高度
    }

    jump() {
      if (this.grounded) {
        this.vy = -this.jumpV; this.grounded = false; this.jumps = 1;
        this.dog.setTexture('westie_jump'); this.dog.anims.stop();
        this.squash(1.18, 0.82);
        if (global.SFX) global.SFX.jump();
        this.dust.emitParticleAt(this.dog.x - this.dog.displayWidth * 0.2, this.feetY, 6);
      } else if (this.jumps < 2) {
        this.vy = -this.jumpV2; this.jumps = 2;
        this.squash(0.8, 1.2);
        this.spin();
        if (global.SFX) global.SFX.doubleJump();
        this.sparks.emitParticleAt(this.dog.x, this.dog.y - this.dog.displayHeight * 0.5, 8);
      }
    }

    squash(sx, sy) {
      this.tweens.add({ targets: this.dog, scaleX: this.dogScale * sx, scaleY: this.dogScale * sy, duration: 110, yoyo: true, ease: 'Quad.out' });
    }
    spin() {
      this.tweens.add({ targets: this.dog, angle: 360, duration: 420, ease: 'Cubic.out', onComplete: () => this.dog.setAngle(0) });
    }

    /* ---------- 主循环 ---------- */
    update(time, delta) {
      const dt = Math.min(delta, 50) / 1000;
      if (this.state === 'paused' || this.state === 'dead') return;

      if (this.state === 'idle') {
        this.bgFar.tilePositionX += this.speed * 0.12 * dt;
        this.ground.tilePositionX += this.speed * dt;
        // 待机轻微上下浮动
        this.dog.y = this.feetY + Math.sin(time / 220) * 4;
        this.scrollMid(dt);
        return;
      }

      // running
      const elapsed = (time - this.startTime) / 1000;
      this.speed = Math.min(this.maxSpeed, this.baseSpeed * (1 + elapsed * 0.022));

      // 滚动
      this.bgFar.tilePositionX += this.speed * 0.12 * dt;
      this.ground.tilePositionX += this.speed * dt;
      this.scrollMid(dt);

      // 主角竖直物理
      this.vy += this.gravity * dt;
      this.dog.y += this.vy * dt;
      if (this.dog.y >= this.feetY) {
        if (!this.grounded) { // 落地
          this.grounded = true; this.vy = 0; this.jumps = 0;
          this.dog.setTexture('westie_run');
          if (this.dog.anims.currentAnim?.key !== 'run' || !this.dog.anims.isPlaying) this.dog.play('run');
          this.squash(1.15, 0.85);
          this.dust.emitParticleAt(this.dog.x - this.dog.displayWidth * 0.15, this.feetY, 8);
        }
        this.dog.y = this.feetY;
      }
      // 奔跑摆动
      if (this.grounded) this.dog.y = this.feetY + Math.sin(time / 70) * 2;

      // 计分（按归一化速度，得分与屏幕尺寸无关，跨设备可公平比分）
      const norm = this.speed / this.W; // ≈0.46~1.05，各设备一致
      this.distNorm += norm * dt;
      this.scoreF += norm * dt * 130;

      // 连击过期
      if (this.combo > 0 && time > this.comboExpire) this.combo = 0;

      // 生成（间隔按速度归一为"时间"，保证任何速度下障碍都能跳过去）
      this.spawnAcc += this.speed * dt;
      if (this.spawnAcc >= this.nextSpawnGap) {
        this.spawnAcc = 0;
        this.spawnPattern(elapsed);
        const diff = 1 + elapsed * 0.03;
        const interval = Phaser.Math.Clamp(1.5 / diff, 0.85, 1.5); // 秒
        this.nextSpawnGap = this.speed * interval * Phaser.Math.FloatBetween(1.0, 1.4);
      }

      this.moveObjects(dt, time);
      this.emitHud();
    }

    scrollMid(dt) {
      this.midAcc += this.speed * dt;
      if (this.midAcc >= Phaser.Math.Between(520, 900)) {
        this.midAcc = 0;
        const key = Math.random() < 0.6 ? 'prop_plant' : 'prop_balloons';
        const img = this.textures.get(key).getSourceImage();
        const targetH = this.H * (key === 'prop_plant' ? 0.34 : 0.30);
        const sp = this.add.image(this.W + 120, this.feetY + (key === 'prop_balloons' ? -this.H * 0.18 : 6), key)
          .setOrigin(0.5, 1).setDepth(5).setScale(targetH / img.height).setAlpha(0.96);
        this.midProps.add(sp);
      }
      this.midProps.children.iterate((c) => {
        if (!c) return true;
        c.x -= this.speed * 0.45 * dt;
        if (c.x < -160) { this.midProps.remove(c, true, true); }
        return true;
      });
    }

    /* ---------- 关卡生成 ---------- */
    spawnPattern(elapsed) {
      // 前两波只出金币，让玩家先热身
      if (this.patternCount < 2) {
        this.patternCount++;
        return Math.random() < 0.5 ? this.patternCoinArc() : this.patternCoinLine();
      }
      this.patternCount++;
      const diff = Math.min(1 + elapsed * 0.04, 4);
      const r = Math.random();
      if (r < 0.34) this.patternObstacle(diff);
      else if (r < 0.52) this.patternCoinArc();
      else if (r < 0.70) this.patternCoinLine();
      else if (r < 0.86) this.patternHighItem();
      else this.patternObstacle(diff, true);
    }

    addObstacle(key, x) {
      const img = this.textures.get(key).getSourceImage();
      const h = Phaser.Math.Clamp(this.H * 0.155, 60, 150) * (key === 'obs_box' ? 1.05 : 1);
      const sp = this.add.image(x, this.feetY + 4, key).setOrigin(0.5, 1).setDepth(15).setScale(h / img.height);
      sp._type = 'obs';
      sp._hit = { w: sp.displayWidth * 0.6, h: sp.displayHeight * 0.72 };
      this.obstacles.push(sp);
      return sp;
    }

    addCoin(x, y) {
      const img = this.textures.get('coin').getSourceImage();
      const s = Phaser.Math.Clamp(this.H * 0.075, 30, 64) / img.height;
      const sp = this.add.image(x, y, 'coin').setOrigin(0.5, 0.5).setDepth(16).setScale(s);
      sp._type = 'coin';
      sp._hit = { w: sp.displayWidth * 0.85, h: sp.displayHeight * 0.85 };
      if (sp.preFX) sp.preFX.addGlow(0xffd24a, 4, 0, false, 0.1, 12);
      this.tweens.add({ targets: sp, y: y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: sp, scaleX: s * 0.6, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.collectibles.push(sp);
      return sp;
    }

    addItem(x, y) {
      const key = Phaser.Utils.Array.GetRandom(ITEM_KEYS);
      const img = this.textures.get(key).getSourceImage();
      const s = Phaser.Math.Clamp(this.H * 0.11, 46, 96) / img.height;
      const sp = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDepth(16).setScale(s);
      sp._type = 'item';
      sp._hit = { w: sp.displayWidth * 0.8, h: sp.displayHeight * 0.8 };
      if (sp.preFX) sp.preFX.addGlow(0xfff1b0, 5, 0, false, 0.1, 14);
      this.tweens.add({ targets: sp, y: y - 10, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.collectibles.push(sp);
      return sp;
    }

    patternObstacle(diff, dbl) {
      const x = this.W + 80;
      this.addObstacle(Phaser.Utils.Array.GetRandom(OBS_KEYS), x);
      if (dbl && diff > 1.6) this.addObstacle(Phaser.Utils.Array.GetRandom(OBS_KEYS), x + this.W * 0.12);
      // 在障碍上方撒几个金币（奖励跳跃）
      const arcY = this.feetY - this.H * 0.30;
      for (let i = 0; i < 3; i++) this.addCoin(x + (i - 1) * this.W * 0.05, arcY + Math.abs(i - 1) * this.H * 0.05);
    }

    patternCoinArc() {
      const x = this.W + 80;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = this.feetY - this.H * 0.10 - Math.sin(t * Math.PI) * this.H * 0.26;
        this.addCoin(x + t * this.W * 0.26, y);
      }
    }

    patternCoinLine() {
      const x = this.W + 80;
      const y = this.feetY - this.H * 0.13;
      for (let i = 0; i < 5; i++) this.addCoin(x + i * this.W * 0.06, y);
    }

    patternHighItem() {
      const x = this.W + 80;
      const high = Math.random() < 0.5;
      this.addItem(x, this.feetY - this.H * (high ? 0.40 : 0.16));
      this.addCoin(x - this.W * 0.07, this.feetY - this.H * 0.16);
      this.addCoin(x + this.W * 0.07, this.feetY - this.H * 0.16);
    }

    /* ---------- 移动 & 碰撞 ---------- */
    moveObjects(dt, time) {
      const dogR = this.dogRect();
      const inv = time < this.invincibleUntil;
      // 受击闪烁
      if (inv) this.dog.setAlpha(0.4 + 0.4 * Math.sin(time / 50));
      else this.dog.setAlpha(1);

      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i];
        o.x -= this.speed * dt;
        if (o.x < -150) { o.destroy(); this.obstacles.splice(i, 1); continue; }
        if (!inv && this.overlap(dogR, this.objRect(o))) { this.takeHit(o, time); }
      }
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const c = this.collectibles[i];
        c.x -= this.speed * dt;
        if (c.x < -120) { c.destroy(); this.collectibles.splice(i, 1); continue; }
        if (this.overlap(dogR, this.objRect(c))) { this.collect(c, time); this.collectibles.splice(i, 1); }
      }
    }

    dogRect() {
      const w = this.dog.displayWidth * 0.52, h = this.dog.displayHeight * 0.74;
      return { x: this.dog.x - w / 2, y: this.dog.y - h, w, h };
    }
    objRect(o) {
      const w = o._hit.w, h = o._hit.h;
      const cy = o._type === 'obs' ? o.y - h / 2 : o.y;
      return { x: o.x - w / 2, y: cy - h / 2, w, h };
    }
    overlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    takeHit(o, time) {
      this.hearts--;
      this.combo = 0;
      this.invincibleUntil = time + 1400;
      this.burst.emitParticleAt(o.x, o.y - o.displayHeight * 0.4, 20);
      this.cameras.main.shake(220, 0.012);
      if (global.SFX) global.SFX.hit();
      // 击退动画
      this.tweens.add({ targets: this.dog, x: this.dogX - this.W * 0.05, duration: 120, yoyo: true, ease: 'Quad.out' });
      o.destroy();
      const idx = this.obstacles.indexOf(o); if (idx >= 0) this.obstacles.splice(idx, 1);
      this.emitHud(true);
      if (this.hearts <= 0) this.die();
    }

    collect(c, time) {
      const isItem = c._type === 'item';
      this.combo++;
      this.comboExpire = time + 2500;
      const mult = Math.min(1 + Math.floor(this.combo / 5), 5);
      if (isItem) {
        const pts = 50 * mult;
        this.scoreF += pts;
        this.floatText('+' + pts, c.x, c.y, '#ff8a3d');
        this.sparks.emitParticleAt(c.x, c.y, 16);
        if (global.SFX) global.SFX.item();
      } else {
        this.coins++;
        this.scoreF += 10;
        this.floatText('+10', c.x, c.y, '#ffcf4a');
        this.sparks.emitParticleAt(c.x, c.y, 8);
        if (global.SFX) global.SFX.coin();
      }
      if (this.combo > 0 && this.combo % 5 === 0) {
        bus.emit('combo', { mult, combo: this.combo });
        if (global.SFX) global.SFX.combo(this.combo / 5);
      }
      c.destroy();
      this.emitHud(true);
    }

    floatText(txt, x, y, color) {
      const t = this.add.text(x, y, txt, {
        fontFamily: 'PingFang SC, sans-serif', fontStyle: '900',
        fontSize: Math.round(this.H * 0.035) + 'px', color, stroke: '#ffffff', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(28);
      this.floaters.add(t);
      this.tweens.add({ targets: t, y: y - this.H * 0.1, alpha: 0, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() });
    }

    die() {
      this.state = 'dead';
      this.dog.anims.stop();
      this.dog.setTexture('westie_jump');
      if (global.SFX) { global.SFX.stopMusic(); global.SFX.gameover(); }
      this.cameras.main.shake(260, 0.016);
      // 主角翻滚落地
      this.tweens.add({ targets: this.dog, angle: -540, y: this.feetY - this.H * 0.05, duration: 700, ease: 'Quad.out' });
      this.tweens.add({ targets: this.dog, alpha: 0.85, duration: 700 });

      const score = Math.floor(this.scoreF);
      const dist = Math.floor(this.distNorm * 55);
      const newBest = score > this.best;
      if (newBest) { this.best = score; localStorage.setItem(BEST_KEY, String(score)); }
      this.time.delayedCall(650, () => {
        bus.emit('gameover', { score, best: this.best, coins: this.coins, distance: dist, newBest });
        bus.emit('state', 'dead');
      });
    }

    emitHud(force) {
      const score = Math.floor(this.scoreF);
      if (force || score !== this.lastHudScore || this.coins !== this.lastHudCoins || this.hearts !== this.lastHudHearts) {
        this.lastHudScore = score; this.lastHudCoins = this.coins; this.lastHudHearts = this.hearts;
        bus.emit('hud', { score, coins: this.coins, hearts: this.hearts });
      }
    }
  }

  /* ---------------- 引导 ---------------- */
  function boot(parentId) {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentId,
      backgroundColor: '#bfe6ff',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: '100%', height: '100%' },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      fps: { target: 60, min: 30 },
      scene: [PreloadScene, PlayScene],
    });
    return game;
  }

  global.WestieGame = { boot, bus };
})(window);
