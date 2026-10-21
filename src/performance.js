/** Adaptive resolution uses wall-clock frame costs; the HTML UI remains native-resolution. */
export class PerformanceGovernor {
  constructor(onChange) {
    this.onChange = onChange;
    this.scale = 1;
    this.samples = [];
    this.cooldown = 2;
    this.stable = 0;
    this.enabled = true;
    this.lastMean = 0;
  }
  configure(settings = {}) {
    this.enabled = settings.autoResolution !== false;
    if (!this.enabled && this.scale !== 1) {
      this.scale = 1;
      this.onChange(this.scale);
    }
    this.samples = [];
    this.cooldown = 1.5;
  }
  reset() {
    this.samples = [];
    this.cooldown = 2;
  }
  update(elapsed, active = true) {
    if (!active || !this.enabled || !Number.isFinite(elapsed) || elapsed <= 0)
      return;
    this.cooldown -= Math.min(elapsed, 1);
    if (this.cooldown > 0) return;
    this.samples.push(Math.min(elapsed, 0.75));
    const total = this.samples.reduce((a, b) => a + b, 0);
    if (total < 1.8 || this.samples.length < 4) return;
    const mean = total / this.samples.length;
    this.lastMean = mean;
    this.samples = [];
    let next = this.scale;
    if (mean > 0.055)
      next = Math.max(0.5, this.scale * (mean > 0.12 ? 0.72 : 0.86));
    else if (mean < 0.023) {
      this.stable += total;
      if (this.stable > 8) {
        next = Math.min(1, this.scale + 0.1);
        this.stable = 0;
      }
    } else this.stable = 0;
    if (Math.abs(next - this.scale) > 0.015) {
      this.scale = next;
      this.onChange(next);
      this.cooldown = 2;
    }
  }
}
