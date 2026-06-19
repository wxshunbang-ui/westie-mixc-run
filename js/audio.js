/* ============ 音效引擎：WebAudio 实时合成（零外部文件） ============ */
(function (global) {
  'use strict';

  const SFX = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: false,
    _musicTimer: null,
    _melodyStep: 0,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
    },

    // iOS/浏览器要求用户手势后才能出声
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.9;
      return this.muted;
    },
    toggleMute() { return this.setMuted(!this.muted); },

    // 单个振荡器音符
    _tone(freq, dur, type, vol, when, slideTo) {
      if (!this.ctx) return;
      const t = when || this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    _noise(dur, vol, when, hp) {
      if (!this.ctx) return;
      const t = when || this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },

    jump()       { this.resume(); this._tone(330, 0.18, 'square', 0.22, 0, 620); },
    doubleJump() { this.resume(); this._tone(520, 0.20, 'square', 0.22, 0, 940); this._tone(660, 0.18, 'sine', 0.12); },
    coin()       { const t = this.ctx ? this.ctx.currentTime : 0; this._tone(988, 0.08, 'square', 0.16, t); this._tone(1319, 0.12, 'square', 0.16, t + 0.07); },
    item() {
      const t = this.ctx ? this.ctx.currentTime : 0;
      [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.12, 'triangle', 0.18, t + i * 0.05));
    },
    combo(level) {
      const t = this.ctx ? this.ctx.currentTime : 0;
      const base = 523 + Math.min(level, 8) * 40;
      [base, base * 1.25, base * 1.5].forEach((f, i) => this._tone(f, 0.1, 'sine', 0.2, t + i * 0.04));
    },
    hit() { this.resume(); this._tone(200, 0.25, 'sawtooth', 0.28, 0, 70); this._noise(0.18, 0.18, 0, 500); },
    gameover() {
      const t = this.ctx ? this.ctx.currentTime : 0;
      [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.32, 'triangle', 0.24, t + i * 0.16));
    },
    button() { this.resume(); this._tone(440, 0.08, 'square', 0.15, 0, 660); },

    // 轻快循环背景乐（C 大调小旋律）
    startMusic() {
      this.resume();
      if (!this.ctx || this._musicTimer) return;
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 1.0);
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33,
                     523.25, 659.25, 784, 880, 1046.5, 880, 784, 659.25];
      const bass  = [130.81, 0, 196, 0, 174.61, 0, 196, 0];
      const step = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const f = scale[this._melodyStep % scale.length];
        // 旋律
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.25);
        // 低音
        const bf = bass[this._melodyStep % bass.length];
        if (bf) {
          const bo = this.ctx.createOscillator(); const bg = this.ctx.createGain();
          bo.type = 'sine'; bo.frequency.value = bf;
          bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.6, t + 0.03);
          bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          bo.connect(bg); bg.connect(this.musicGain); bo.start(t); bo.stop(t + 0.45);
        }
        this._melodyStep++;
      };
      step();
      this._musicTimer = setInterval(step, 220);
    },
    stopMusic() {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
      if (this.ctx && this.musicGain) {
        this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.4);
      }
    },
  };

  global.SFX = SFX;
})(window);
