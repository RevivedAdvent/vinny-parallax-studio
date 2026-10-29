/** Optional procedural preview ambience, not a recorded or voiced soundtrack. */
export class Ambience {
  private context?: AudioContext;
  private gain?: GainNode;
  private enabled = false;
  async setEnabled(enabled: boolean) {
    if (!enabled && !this.context) return;
    if (!this.context) {
      const ctx = this.context = new AudioContext();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.025) / 1.025;
        data[i] = last * 3;
      }
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400;
      const gain = this.gain = ctx.createGain(); gain.gain.value = 0;
      noise.connect(filter).connect(gain).connect(ctx.destination); noise.start();
    }
    await this.context.resume();
    this.enabled = enabled;
    this.gain!.gain.setTargetAtTime(enabled ? 0.22 : 0, this.context.currentTime, 0.35);
  }
  async pause() { if (this.context) await this.context.suspend(); }
  async resume() { if (this.enabled && this.context) await this.context.resume(); }
}
