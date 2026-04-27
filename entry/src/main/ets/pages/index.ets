@Entry
@Component
struct IndexPage {
  @State private detecting: boolean = false;
  @State private thresholdSeconds: number = 2.5;
  @State private sensitivity: number = 65;

  private async startService(): Promise<void> {
    const want = {
      bundleName: getContext().getBundleName(),
      abilityName: 'SnoreServiceAbility',
      action: 'com.example.snorealarm.ACTION_START',
      parameters: {
        thresholdSeconds: this.thresholdSeconds,
        sensitivity: this.sensitivity,
      }
    };

    try {
      await getContext().startAbility(want);
      this.detecting = true;
    } catch (err) {
      console.error(`start service failed: ${JSON.stringify(err)}`);
    }
  }

  private async stopService(): Promise<void> {
    const want = {
      bundleName: getContext().getBundleName(),
      abilityName: 'SnoreServiceAbility',
      action: 'com.example.snorealarm.ACTION_STOP',
    };

    try {
      await getContext().startAbility(want);
      this.detecting = false;
    } catch (err) {
      console.error(`stop service failed: ${JSON.stringify(err)}`);
    }
  }

  private async toggleDetection(): Promise<void> {
    if (this.detecting) {
      await this.stopService();
      return;
    }
    await this.startService();
  }

  build() {
    Column({ space: 16 }) {
      Text('鼾声检测叫醒')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)

      Text(this.detecting ? '状态：检测中' : '状态：未检测')
        .fontSize(16)
        .fontColor(this.detecting ? '#0A7E07' : '#666666')

      Column({ space: 8 }) {
        Text(`触发阈值时长：${this.thresholdSeconds.toFixed(1)} 秒`)
          .fontSize(16)
        Slider({
          value: this.thresholdSeconds,
          min: 0.5,
          max: 10,
          step: 0.5,
          style: SliderStyle.OutSet,
          direction: Axis.Horizontal,
          reverse: false
        })
          .enabled(!this.detecting)
          .onChange((value: number) => {
            this.thresholdSeconds = value;
          })
      }
      .width('100%')

      Column({ space: 8 }) {
        Text(`检测灵敏度：${Math.round(this.sensitivity)}%`)
          .fontSize(16)
        Slider({
          value: this.sensitivity,
          min: 1,
          max: 100,
          step: 1,
          style: SliderStyle.OutSet,
          direction: Axis.Horizontal,
          reverse: false
        })
          .enabled(!this.detecting)
          .onChange((value: number) => {
            this.sensitivity = value;
          })
      }
      .width('100%')

      Button({ type: ButtonType.Capsule, stateEffect: true }) {
        Text(this.detecting ? '停止检测' : '开始检测')
          .fontSize(18)
          .fontColor(Color.White)
      }
      .width('80%')
      .height(48)
      .backgroundColor(this.detecting ? '#C92A2A' : '#2B8A3E')
      .onClick(() => {
        this.toggleDetection();
      })

      Text('说明：当连续鼾声超过设定时长，将触发“响铃 + 振动 + 手电筒闪烁”。')
        .fontSize(13)
        .fontColor('#888888')
        .textAlign(TextAlign.Center)
    }
    .padding(20)
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
