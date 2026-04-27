import common from '@ohos.app.ability.common';
import ServiceAbility from '@ohos.app.ability.ServiceAbility';
import backgroundTaskManager from '@ohos.backgroundTaskManager';
import wantAgent from '@ohos.wantAgent';
import audio from '@ohos.multimedia.audio';
import vibrator from '@ohos.vibrator';
import camera from '@ohos.multimedia.camera';
import { BusinessError } from '@ohos.base';

import SnoreDetector from '../common/SnoreDetector';

const ACTION_START = 'com.example.snorealarm.ACTION_START';
const ACTION_STOP = 'com.example.snorealarm.ACTION_STOP';

export default class SnoreServiceAbility extends ServiceAbility {
  private capturer?: audio.AudioCapturer;
  private detecting: boolean = false;
  private taskRunning: boolean = false;
  private detector: SnoreDetector = new SnoreDetector();
  private alarmInProgress: boolean = false;
  private lastAlarmAt: number = 0;

  async onStart(want: common.Want): Promise<void> {
    await super.onStart(want);
    await this.handleStartCommand(want);
  }

  async onCommand(want: common.Want, startId: number): Promise<void> {
    const action = want.action;
    if (action === ACTION_STOP) {
      await this.stopDetection();
      await this.stopBackgroundTask();
      this.terminateSelf();
      return;
    }

    if (action === ACTION_START || !action) {
      await this.handleStartCommand(want);
    }
  }

  async onStop(): Promise<void> {
    await this.stopDetection();
    await this.stopBackgroundTask();
    await super.onStop();
  }

  private async handleStartCommand(want: common.Want): Promise<void> {
    const params = want.parameters as Record<string, Object> | undefined;
    const thresholdSeconds = Number(params?.thresholdSeconds ?? 2.5);
    const sensitivity = Number(params?.sensitivity ?? 65);

    const safeThresholdMs = Math.max(0.5, Math.min(10, thresholdSeconds)) * 1000;
    const safeSensitivity = Math.max(1, Math.min(100, sensitivity));

    // sensitivity 越高，阈值越低（更容易触发）
    const rmsThreshold = 2000 + ((100 - safeSensitivity) / 100) * 6000;
    this.detector.setConfig({
      rmsThreshold,
      triggerDurationMs: safeThresholdMs,
    });

    await this.startBackgroundTask();
    await this.startDetection();
  }

  private async startBackgroundTask(): Promise<void> {
    if (this.taskRunning) {
      return;
    }

    try {
      const agentInfo: wantAgent.WantAgentInfo = {
        wants: [{ bundleName: this.context.getBundleName(), abilityName: 'EntryAbility' }],
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
      this.taskRunning = true;
    } catch (err) {
      const e = err as BusinessError;
      console.error(`startBackgroundRunning failed: code=${e.code}, message=${e.message}`);
    }
  }

  private async stopBackgroundTask(): Promise<void> {
    if (!this.taskRunning) {
      return;
    }

    try {
      await backgroundTaskManager.stopBackgroundRunning(this);
      this.taskRunning = false;
    } catch (err) {
      const e = err as BusinessError;
      console.error(`stopBackgroundRunning failed: code=${e.code}, message=${e.message}`);
    }
  }

  private async startDetection(): Promise<void> {
    if (this.detecting) {
      return;
    }

    try {
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

      this.runDetectionLoop();
    } catch (err) {
      const e = err as BusinessError;
      console.error(`startDetection failed: code=${e.code}, message=${e.message}`);
      this.detecting = false;
    }
  }

  private async runDetectionLoop(): Promise<void> {
    if (!this.capturer) {
      return;
    }

    const sampleRate = 16000;
    const frameSamples = 320;
    const bufferBytes = frameSamples * Int16Array.BYTES_PER_ELEMENT;

    while (this.detecting && this.capturer) {
      try {
        const arrayBuffer = new ArrayBuffer(bufferBytes);
        const bytesRead = await this.capturer.read(arrayBuffer);
        if (bytesRead <= 0) {
          continue;
        }

        const validSamples = Math.floor(bytesRead / Int16Array.BYTES_PER_ELEMENT);
        if (validSamples <= 0) {
          continue;
        }

        const frame = new Int16Array(arrayBuffer, 0, validSamples);
        const frameDurationMs = (validSamples / sampleRate) * 1000;
        const detected = this.detector.processFrame(frame, frameDurationMs);

        const now = Date.now();
        const cooldownMs = 10_000;
        if (detected && !this.alarmInProgress && now - this.lastAlarmAt >= cooldownMs) {
          this.alarmInProgress = true;
          this.lastAlarmAt = now;
          await this.triggerAlarm();
          this.detector.reset();
          this.alarmInProgress = false;
        }
      } catch (err) {
        const e = err as BusinessError;
        console.error(`audio read failed: code=${e.code}, message=${e.message}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  private async stopDetection(): Promise<void> {
    this.detecting = false;
    this.detector.reset();

    if (!this.capturer) {
      return;
    }

    try {
      await this.capturer.stop();
      await this.capturer.release();
    } catch (err) {
      const e = err as BusinessError;
      console.error(`stopDetection failed: code=${e.code}, message=${e.message}`);
    } finally {
      this.capturer = undefined;
    }
  }

  private async triggerAlarm(): Promise<void> {
    // 响铃：当前最小实现通过节律性振动模拟持续铃声提醒。
    try {
      for (let i = 0; i < 4; i++) {
        await vibrator.startVibration({ duration: 500 });
        await new Promise<void>((resolve) => setTimeout(resolve, 650));
      }
      await vibrator.stopVibration();
    } catch (err) {
      const e = err as BusinessError;
      console.error(`vibration failed: code=${e.code}, message=${e.message}`);
    }

    // 手电筒闪烁
    try {
      const cameraManager = await camera.getCameraManager();
      const ids = cameraManager.getCameraIdList();
      if (ids.length > 0) {
        const cameraId = ids[0];
        const supported = await cameraManager.isTorchModeSupported(cameraId);
        if (supported) {
          for (let i = 0; i < 6; i++) {
            const on = i % 2 === 0;
            await cameraManager.setTorchMode(cameraId, on);
            await new Promise<void>((resolve) => setTimeout(resolve, 250));
          }
          await cameraManager.setTorchMode(cameraId, false);
        }
      }
    } catch (err) {
      const e = err as BusinessError;
      console.error(`torch failed: code=${e.code}, message=${e.message}`);
    }
  }
}
