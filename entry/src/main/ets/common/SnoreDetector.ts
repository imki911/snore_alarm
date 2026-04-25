/**
 * SnoreDetector encapsulates simple snoring detection logic based on
 * amplitude thresholding.  It processes PCM audio frames and counts
 * consecutive frames whose RMS amplitude exceeds a configurable
 * threshold.  When the count reaches a specified number of frames,
 * the detector reports that snoring has occurred.  Call reset() to
 * clear the internal counter after an alarm has been issued.
 */
export default class SnoreDetector {
  private readonly rmsThreshold: number;
  private readonly framesToTrigger: number;
  private consecutiveHighFrames: number;

  /**
   * Construct a detector.
   *
   * @param rmsThreshold   RMS amplitude above which a frame is considered loud.
   *                       Typical PCM samples range in [-32768, 32767].
   * @param framesToTrigger Number of consecutive loud frames required to
   *                       trigger detection.  For example, with a 20 ms
   *                       frame size and framesToTrigger=50, snoring
   *                       must persist for roughly 1 second.
   */
  constructor(rmsThreshold: number = 5000, framesToTrigger: number = 50) {
    this.rmsThreshold = rmsThreshold;
    this.framesToTrigger = framesToTrigger;
    this.consecutiveHighFrames = 0;
  }

  /**
   * Process an audio frame.  Returns true if snoring has been detected.
   *
   * @param frame PCM audio samples encoded as Int16 values.
   */
  processFrame(frame: Int16Array): boolean {
    // Compute root-mean-square amplitude of the frame.  Using RMS
    // rather than peak amplitude provides a more stable measure of
    // loudness and helps filter out transient clicks.
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / frame.length);

    if (rms >= this.rmsThreshold) {
      this.consecutiveHighFrames++;
      if (this.consecutiveHighFrames >= this.framesToTrigger) {
        return true;
      }
    } else {
      this.consecutiveHighFrames = 0;
    }
    return false;
  }

  /**
   * Reset the internal frame counter.  Call this after issuing an
   * alarm to avoid repeated triggers on the same snoring episode.
   */
  reset(): void {
    this.consecutiveHighFrames = 0;
  }
}
