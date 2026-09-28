/**
 * Loud, repeating two-tone alarm via Web Audio plus vibration. The
 * AudioContext must be created/resumed from a user gesture, so call
 * `prime()` from a click handler (e.g. when arming the anchor watch).
 */
export class Alarm {
  private ctx: AudioContext | null = null;
  private timer: number | undefined;
  sounding = false;

  prime(): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      /* audio unavailable */
    }
  }

  start(): void {
    if (this.sounding) return;
    this.sounding = true;
    this.prime();
    const beep = () => {
      this.tone(880, 0, 0.25);
      this.tone(660, 0.3, 0.25);
      navigator.vibrate?.([400, 150, 400]);
    };
    beep();
    this.timer = window.setInterval(beep, 1200);
  }

  stop(): void {
    this.sounding = false;
    clearInterval(this.timer);
    navigator.vibrate?.(0);
  }

  private tone(freq: number, at: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}
