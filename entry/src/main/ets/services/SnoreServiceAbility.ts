import common from '@ohos.app.ability.common';
import ServiceAbility from '@ohos.app.ability.ServiceAbility';
import backgroundTaskManager from '@ohos.backgroundTaskManager';
import wantAgent from '@ohos.wantAgent';
import audio from '@ohos.multimedia.audio';
import vibrator from '@ohos.vibrator';
import camera from '@ohos.multimedia.camera';
import { BusinessError } from '@ohos.base';

import SnoreDetector from '../common/SnoreDetector';

/**
 * SnoreServiceAbility runs in the background to monitor audio from the
 * microphone, detect snoring using a simple amplitude‑based algorithm,
 * and trigger alarms (vibration and flashlight) when snoring persists.
 *
 * It requests a continuous background task of type AUDIO_RECORDING so
 * that microphone capture may continue while the application is in the
 * background.  The continuous task is stopped when the service is
 * terminated.
 */
export default class SnoreServiceAbility extends ServiceAbility {
  private capturer?: audio.AudioCapturer;
  private detecting: boolean = false;
  private detector: SnoreDetector = new SnoreDetector();
  private alarmInProgress: boolean = false;

  /**
   * Called when the service is started.  This is where we request
   * permission to run as a continuous task and spawn the audio
   * detection loop.  If the service is already running, calls to
   * onCommand will be used for start/stop control.
   */
  async onStart(want: common.Want): Promise<void> {
    console.info('SnoreServiceAbility onStart');
    await super.onStart(want);
    await this.startBackgroundTask();
    await this.startDetection();
  }

  /**
   * Called when the service receives a start command.  The Want may
   * carry an action to start or stop detection.  Use this to allow
   * the UI to control the service without restarting it.
   */
  async onCommand(want: common.Want, startId: number): Promise<void> {
    console.info('SnoreServiceAbility onCommand: ' + JSON.stringify(want));
    const action = want.action;
    if (action === 'com.example.snorealarm.ACTION_STOP') {
      await this.stopDetection();
      // After stopping detection we terminate the service.  This
      // releases resources and stops the continuous background task.
      this.terminateSelf();
    } else if (action === 'com.example.snorealarm.ACTION_START') {
      if (!this.detecting) {
        await this.startBackgroundTask();
        await this.startDetection();
      }
    }
  }

  /**
   * Called when the service is stopped or destroyed.  Clean up
   * resources and stop the background task.
   */
  async onStop(): Promise<void> {
    console.info('SnoreServiceAbility onStop');
    await this.stopDetection();
    await this.stopBackgroundTask();
    await super.onStop();
  }

  /**
   * Start the continuous background task required for recording
   * microphone audio in the background.  This method obtains a
   * WantAgent pointing back to the EntryAbility so that the
   * system can bring the app to the foreground if needed.
   */
  private async startBackgroundTask(): Promise<void> {
    try {
      const agentInfo: wantAgent.WantAgentInfo = {
        wants: [
          {
            // When the system terminates the service due to resource
            // constraints, the user can tap the notification to
            // return to the main UI.  We specify the bundle and
            // ability names of EntryAbility here.
            bundleName: this.context.getBundleName(),
            abilityName: 'EntryAbility',
          },
        ],
        flags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
        operationType: wantAgent.OperationType.START_ABILITY,
        requestCode: 0,
      };
      const agent = await wantAgent.getWantAgent(agentInfo);
      await backgroundTaskManager.startBackgroundRunning(
        this,
        backgroundTaskManager.BackgroundMode.AUDIO_RECORDING,
        agent,
      );
      console.info('Background task started');
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Failed to start background task: code=${e.code}, message=${e.message}`);
    }
  }

  /**
   * Stop the continuous background task.  Call this when the service
   * terminates so that system resources are released.
   */
  private async stopBackgroundTask(): Promise<void> {
    try {
      await backgroundTaskManager.stopBackgroundRunning(this);
      console.info('Background task stopped');
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Failed to stop background task: code=${e.code}, message=${e.message}`);
    }
  }

  /**
   * Start capturing audio and analysing for snoring.  This method
   * configures the audio capturer and runs a loop that reads PCM
   * frames.  The loop runs until detecting is false.
   */
  private async startDetection(): Promise<void> {
    if (this.detecting) {
      return;
    }
    try {
      // Configure audio stream.  Use 16 kHz mono PCM 16‑bit format.
      const streamInfo: audio.AudioStreamInfo = {
        samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
        channels: 1,
        sampleFormat: audio.AudioSampleFormat.S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_PCM,
      };
      const capturerInfo: audio.AudioCapturerInfo = {
        source: audio.SourceType.MIC,
        capturerFlags: 0,
      };
      this.capturer = await audio.createAudioCapturer(streamInfo, capturerInfo);
      await this.capturer.start();
      this.detecting = true;
      console.info('Audio capturer started');

      // Frame configuration: 320 samples ~ 20 ms at 16 kHz.
      const frameSize: number = 320;
      const buffer = new Int16Array(frameSize);

      // Loop function defined separately so that we can release
      // resources on stop via this.detecting flag.
      const loop = async (): Promise<void> => {
        while (this.detecting) {
          // Read PCM data into buffer.  The read method fills the
          // provided ArrayBuffer and returns the number of bytes read.
          try {
            const arrayBuffer = new ArrayBuffer(frameSize * Int16Array.BYTES_PER_ELEMENT);
            const len = await this.capturer!.read(arrayBuffer);
            if (len > 0) {
              const frame = new Int16Array(arrayBuffer);
              const detected = this.detector.processFrame(frame);
              if (detected && !this.alarmInProgress) {
                this.alarmInProgress = true;
                await this.triggerAlarm();
                // Reset the detector after the alarm finishes to avoid
                // immediate retriggering on the same snoring episode.
                this.detector.reset();
                this.alarmInProgress = false;
              }
            }
          } catch (readErr) {
            const e = readErr as BusinessError;
            console.error(`Audio read error: code=${e.code}, message=${e.message}`);
            // Wait a short period before retrying to avoid spinning on errors.
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      };
      // Kick off the detection loop without awaiting it.  The loop
      // will run until detecting is set false in stopDetection().
      // Use a background promise to avoid blocking the main thread.
      loop();
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Failed to start detection: code=${e.code}, message=${e.message}`);
    }
  }

  /**
   * Stop capturing audio and end snoring detection.  This will
   * terminate the detection loop and release the audio capturer.
   */
  private async stopDetection(): Promise<void> {
    if (!this.detecting) {
      return;
    }
    this.detecting = false;
    try {
      if (this.capturer) {
        await this.capturer.stop();
        await this.capturer.release();
        this.capturer = undefined;
        console.info('Audio capturer stopped');
      }
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Failed to stop capturer: code=${e.code}, message=${e.message}`);
    }
  }

  /**
   * Trigger the wake‑up alarm.  This function performs three actions:
   *   1. Vibrates the device for a few seconds.
   *   2. Flashes the torch (flashlight) on and off.
   *   3. Plays a simple beep via the speaker.  Since playing a
   *      sound requires additional assets and complexity, this
   *      implementation omits the beep and instead relies on
   *      vibration and flashlight, which are sufficient to rouse
   *      the user at night.
   */
  private async triggerAlarm(): Promise<void> {
    console.info('Snore detected – triggering alarm');
    // Vibrate for 2 seconds.  We create a VibrateTime effect with
    // duration 2000 ms.  The optional attribute is omitted to
    // use the default vibration style.
    try {
      await vibrator.startVibration({ duration: 2000 });
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Vibration error: code=${e.code}, message=${e.message}`);
    }

    // Flash the torch on and off three times.  Some devices may not
    // support the torch; check before using.  We obtain the
    // camera manager via camera.getCameraManager().
    try {
      const cameraManager = await camera.getCameraManager();
      const cameraIdList = cameraManager.getCameraIdList();
      if (cameraIdList.length > 0) {
        const cameraId = cameraIdList[0];
        const support = await cameraManager.isTorchModeSupported(cameraId);
        if (support) {
          for (let i = 0; i < 3; i++) {
            await cameraManager.setTorchMode(cameraId, true);
            await new Promise((resolve) => setTimeout(resolve, 300));
            await cameraManager.setTorchMode(cameraId, false);
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } else {
          console.warn('Torch not supported on this device');
        }
      }
    } catch (err) {
      const e = err as BusinessError;
      console.error(`Torch error: code=${e.code}, message=${e.message}`);
    }
    // Ensure vibration stops after alarm; some devices may continue
    // vibrating if not explicitly cancelled.
    try {
      await vibrator.stopVibration();
    } catch (err) {
      // ignore
    }
  }
}
