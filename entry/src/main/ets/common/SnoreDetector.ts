/**
 * Lightweight snore detector based on continuous loudness duration.
 *
 * The detector consumes PCM16 audio frames, computes RMS per frame,
 * and accumulates time while the loudness stays above threshold.
 * When loudness duration exceeds the configured trigger duration,
 * it emits true once and waits for reset().
 */
export interface SnoreDetectorConfig {
  rmsThreshold: number;
  triggerDurationMs: number;
}

export default class SnoreDetector {
  private rmsThreshold: number;
  private triggerDurationMs: number;
  private accumulatedHighMs: number = 0;

  constructor(config?: Partial<SnoreDetectorConfig>) {
    this.rmsThreshold = config?.rmsThreshold ?? 4200;
    this.triggerDurationMs = config?.triggerDurationMs ?? 2500;
  }

  setConfig(config: Partial<SnoreDetectorConfig>): void {
    if (config.rmsThreshold !== undefined && config.rmsThreshold > 0) {
      this.rmsThreshold = config.rmsThreshold;
    }
    if (config.triggerDurationMs !== undefined && config.triggerDurationMs > 0) {
      this.triggerDurationMs = config.triggerDurationMs;
    }
  }

  processFrame(frame: Int16Array, frameDurationMs: number): boolean {
    if (frame.length === 0 || frameDurationMs <= 0) {
      return false;
    }

    let sumSquares = 0;
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i];
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / frame.length);
    if (rms >= this.rmsThreshold) {
      this.accumulatedHighMs += frameDurationMs;
      return this.accumulatedHighMs >= this.triggerDurationMs;
    }

    this.accumulatedHighMs = 0;
    return false;
  }

  reset(): void {
    this.accumulatedHighMs = 0;
  }
}
