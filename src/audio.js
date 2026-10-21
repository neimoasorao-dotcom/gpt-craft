// Original procedural score and sound palette; no downloaded audio assets.
const NOTES = [146.832, 174.614, 220, 261.626, 293.665, 349.228, 440, 523.251];
const DEFAULTS = { volume: 0.55, musicVolume: 0.26, effectsVolume: 0.72 };
const limit = (x) => Math.max(0, Math.min(1, Number(x) || 0));

export class AudioSystem {
  constructor(settings = {}) {
    this.settings = { ...DEFAULTS, ...settings };
    this.context = null;
    this.master = null;
    this.music = null;
    this.effects = null;
    this.noiseBuffer = null;
    this.elapsed = 0;
    this.musicTimer = 3;
    this.birdTimer = 5;
    this.noteIndex = 0;
    this.lastPlay = new Map();
    this.nodes = new Set();
    this.initializing = null;
    this.disposed = false;
  }

  async init() {
    if (this.disposed) return;
    try {
      const AudioContextClass =
        globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.context) {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        // Gentle compression prevents overlapping mining/UI voices from clipping.
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        this.music.connect(this.master);
        this.effects.connect(this.master);
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
        this.compressor = compressor;
        this.noiseBuffer = this.context.createBuffer(
          1,
          this.context.sampleRate * 2,
          this.context.sampleRate,
        );
        const data = this.noiseBuffer.getChannelData(0);
        let pink = 0;
        for (let i = 0; i < data.length; i++) {
          pink = 0.92 * pink + 0.08 * (Math.random() * 2 - 1);
          data[i] = pink * 2.3;
        }
        this.setSettings(this.settings);
        this.createWind();
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.initializing = null;
    } catch {
      // A browser without audio permission still supports the full game.
      this.initializing = null;
    }
  }

  createWind() {
    if (!this.context || this.wind) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 450;
    const gain = this.context.createGain();
    gain.gain.value = 0.025;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    source.start();
    this.wind = { source, filter, gain };
  }

  setSettings(patch = {}) {
    this.settings = { ...this.settings, ...patch };
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(limit(this.settings.volume), now, 0.08);
    this.music?.gain.setTargetAtTime(
      limit(this.settings.musicVolume),
      now,
      0.08,
    );
    this.effects?.gain.setTargetAtTime(
      limit(this.settings.effectsVolume),
      now,
      0.08,
    );
  }

  tone(
    frequency,
    duration = 0.12,
    volume = 0.1,
    wave = "sine",
    destination = this.effects,
    delay = 0,
    endFrequency = frequency,
  ) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.nodes.size > 60
    )
      return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency !== frequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        start + duration,
      );
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      volume,
      start + Math.min(0.015, duration * 0.15),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination || this.effects);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.nodes.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise(
    duration = 0.1,
    volume = 0.1,
    frequency = 800,
    type = "lowpass",
    delay = 0,
  ) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.nodes.size > 60
    )
      return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    this.nodes.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.nodes.delete(source);
    };
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.01);
  }

  play(type, options = {}) {
    if (!this.context || this.context.state !== "running" || this.disposed)
      return;
    const now = this.context.currentTime;
    const minInterval =
      type === "mine"
        ? 0.075
        : type === "step"
          ? 0.18
          : type === "pickup"
            ? 0.045
            : 0.025;
    if (now - (this.lastPlay.get(type) ?? -10) < minInterval) return;
    this.lastPlay.set(type, now);
    const variation = 0.93 + Math.random() * 0.14;
    const material =
      typeof options === "string" ? options : options.material || "";
    switch (type) {
      case "creature_hart": {
        const gain = limit(options.volume ?? 0.8);
        this.tone(
          370 * variation,
          0.38,
          0.025 * gain,
          "triangle",
          this.effects,
          0,
          290,
        );
        this.tone(
          430 * variation,
          0.22,
          0.012 * gain,
          "sine",
          this.effects,
          0.2,
          340,
        );
        break;
      }
      case "creature_mossback": {
        const gain = limit(options.volume ?? 0.8);
        this.tone(
          185 * variation,
          0.42,
          0.035 * gain,
          "triangle",
          this.effects,
          0,
          143,
        );
        this.tone(
          278 * variation,
          0.3,
          0.01 * gain,
          "sine",
          this.effects,
          0.03,
          215,
        );
        break;
      }
      case "creature_hare":
        this.tone(930 * variation, 0.09, 0.018, "sine", this.effects, 0, 1130);
        break;
      case "creature_windbird":
        this.birdsong();
        break;
      case "creature_shardling":
        this.tone(
          165 * variation,
          0.55,
          0.022,
          "triangle",
          this.effects,
          0,
          130,
        );
        this.tone(
          247 * variation,
          0.62,
          0.016,
          "sine",
          this.effects,
          0.04,
          196,
        );
        this.noise(0.28, 0.035, 650, "bandpass");
        break;
      case "creature_duskboar":
        this.tone(
          105 * variation,
          0.26,
          0.035,
          "sawtooth",
          this.effects,
          0,
          57,
        );
        this.noise(0.22, 0.055, 320);
        break;
      case "creature_windup":
        this.tone(170, 0.32, 0.052, "triangle", this.effects, 0, 310);
        this.tone(255, 0.32, 0.02, "sine", this.effects, 0, 465);
        break;
      case "creature_strike":
        this.noise(0.16, 0.1, 950);
        this.tone(95, 0.13, 0.05, "triangle", this.effects, 0, 45);
        break;
      case "step":
        if (/water|水/.test(material)) {
          this.noise(0.19, 0.13, 1600, "bandpass");
          this.tone(160 * variation, 0.06, 0.018, "sine", this.effects, 0, 70);
        } else if (/stone|rock|石|鉱|crystal/.test(material)) {
          this.noise(0.07, 0.13, 1600);
          this.tone(
            120 * variation,
            0.055,
            0.04,
            "triangle",
            this.effects,
            0,
            65,
          );
        } else if (/wood|plank|木/.test(material)) {
          this.tone(
            175 * variation,
            0.08,
            0.065,
            "triangle",
            this.effects,
            0,
            100,
          );
          this.noise(0.055, 0.09, 500);
        } else {
          this.noise(0.1, 0.16, 650);
          this.tone(80 * variation, 0.07, 0.03, "sine", this.effects, 0, 40);
        }
        break;
      case "mine":
        this.noise(
          0.065,
          0.15,
          /wood|木/.test(material) ? 700 : 1900,
          "bandpass",
        );
        this.tone(
          190 * variation,
          0.055,
          0.045,
          "triangle",
          this.effects,
          0,
          90,
        );
        break;
      case "break":
        this.noise(0.24, 0.3, 1600);
        this.tone(
          130 * variation,
          0.16,
          0.075,
          "triangle",
          this.effects,
          0,
          42,
        );
        this.noise(0.15, 0.11, 400, "lowpass", 0.07);
        break;
      case "place":
        this.noise(0.08, 0.16, 700);
        this.tone(165 * variation, 0.1, 0.07, "triangle", this.effects, 0, 90);
        break;
      case "pickup":
        this.tone(740 * variation, 0.12, 0.05, "sine");
        this.tone(1110 * variation, 0.16, 0.035, "sine", this.effects, 0.055);
        break;
      case "craft":
        [0, 4, 7].forEach((note, i) =>
          this.tone(
            440 * 2 ** (note / 12),
            0.3,
            0.06,
            "triangle",
            this.effects,
            i * 0.07,
          ),
        );
        this.noise(0.07, 0.08, 2700, "highpass");
        break;
      case "hit":
        this.noise(0.15, 0.27, 700);
        this.tone(185 * variation, 0.16, 0.11, "sawtooth", this.effects, 0, 48);
        break;
      case "hurt":
        this.noise(0.2, 0.2, 430);
        this.tone(115, 0.22, 0.1, "triangle", this.effects, 0, 55);
        break;
      case "death":
        [220, 174.6, 146.8, 110].forEach((note, i) =>
          this.tone(note, 0.9, 0.07, "triangle", this.effects, i * 0.23),
        );
        break;
      case "ui":
        this.tone(
          options.back ? 420 : 620,
          0.055,
          0.025,
          "sine",
          this.effects,
          0,
          options.back ? 320 : 740,
        );
        break;
      case "eat":
        this.noise(0.08, 0.15, 1700);
        this.noise(0.08, 0.1, 1200, "lowpass", 0.12);
        break;
      case "jump":
        this.tone(120, 0.09, 0.035, "sine", this.effects, 0, 170);
        break;
      case "splash":
        this.noise(0.45, 0.25, 1300, "bandpass");
        break;
      case "ambient":
        this.birdsong();
        break;
      case "save":
        this.tone(660, 0.12, 0.035);
        this.tone(880, 0.22, 0.03, "sine", this.effects, 0.08);
        break;
      case "discover":
        [293.665, 440, 587.33, 739.99].forEach((note, i) =>
          this.tone(note, 1.1, 0.055, "sine", this.effects, i * 0.1),
        );
        break;
      default:
        break;
    }
  }

  birdsong() {
    const frequency = 1450 + Math.random() * 1200;
    for (let i = 0; i < 3; i++)
      this.tone(
        frequency * (1 + i * 0.08),
        0.12,
        0.014,
        "sine",
        this.effects,
        i * 0.16,
        frequency * (1.12 - i * 0.025),
      );
  }

  update(dt, state = {}) {
    if (!this.context || this.context.state !== "running" || this.disposed)
      return;
    this.elapsed += dt;
    this.musicTimer -= dt;
    this.birdTimer -= dt;
    const night = (state.time ?? 0.4) < 0.23 || (state.time ?? 0.4) > 0.77;
    const underground = !!state.underground;
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(
        state.inWater
          ? 0.07
          : underground
            ? 0.009
            : 0.025 + Math.sin(this.elapsed * 0.15) * 0.006,
        this.context.currentTime,
        1,
      );
      this.wind.filter.frequency.setTargetAtTime(
        state.inWater ? 170 : underground ? 250 : 500,
        this.context.currentTime,
        1,
      );
    }
    if (this.musicTimer <= 0) {
      this.musicTimer = 2.7 + Math.random() * 2.9;
      // A pentatonic glass-and-reed motif whose voicing follows the day.
      const sequence = [0, 2, 4, 3, 5, 2, 1, 4, 6, 4, 2, 0];
      const index = sequence[this.noteIndex++ % sequence.length];
      const note = NOTES[index] * (night ? 0.5 : 1);
      const volume = underground ? 0.045 : 0.065;
      this.tone(note, 3.8, volume, "sine", this.music);
      this.tone(note * 2, 2.4, volume * 0.24, "triangle", this.music, 0.04);
      if (this.noteIndex % 3 === 0)
        this.tone(NOTES[0] * 0.5, 6, 0.03, "sine", this.music, 0.3);
      if (this.noteIndex % 4 === 0)
        this.tone(note * 1.5, 3, 0.022, "sine", this.music, 0.8);
    }
    if (this.birdTimer <= 0) {
      this.birdTimer = 9 + Math.random() * 16;
      if (!night && !state.inWater && !underground) this.birdsong();
      else if (night && !underground && !state.inWater)
        this.tone(2100, 0.1, 0.007, "sine", this.effects, 0, 2150);
    }
  }

  dispose() {
    this.disposed = true;
    for (const node of this.nodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    }
    this.nodes.clear();
    if (this.wind) {
      try {
        this.wind.source.stop();
      } catch {}
      this.wind.source.disconnect();
      this.wind.filter.disconnect();
      this.wind.gain.disconnect();
    }
    this.master?.disconnect();
    this.music?.disconnect();
    this.effects?.disconnect();
    this.compressor?.disconnect();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
