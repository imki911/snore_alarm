// Importing Context is unnecessary here because getContext() is
// available in declarative UI pages to access the ability context.

/**
 * The main page of the application.  This page provides a button
 * that starts and stops the background snore detection service.  It
 * maintains local state to reflect whether detection is active and
 * updates the button label accordingly.
 */
@Entry
@Component
struct IndexPage {
  /**
   * Whether snore detection is currently active.  This state
   * controls the button label and behaviour.
   */
  @State private detecting: boolean = false;

  /**
   * Start the snore detection service by issuing an explicit Want to
   * the SnoreServiceAbility.  The Want includes an action
   * instructing the service to start detection.  When the service
   * starts successfully, update the local state.
   */
  private async startService(): Promise<void> {
    const want = {
      bundleName: getContext().getBundleName(),
      abilityName: 'SnoreServiceAbility',
      action: 'com.example.snorealarm.ACTION_START',
    };
    try {
      await getContext().startAbility(want);
      this.detecting = true;
    } catch (err) {
      console.error('Failed to start service: ' + JSON.stringify(err));
    }
  }

  /**
   * Stop the snore detection service by sending a STOP action.  The
   * service will stop detection and terminate itself.  Update the
   * local state to reflect that detection is no longer active.
   */
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
      console.error('Failed to stop service: ' + JSON.stringify(err));
    }
  }

  /**
   * Toggle detection state.  If detection is currently inactive,
   * start the service; otherwise stop it.
   */
  private async toggleDetection(): Promise<void> {
    if (this.detecting) {
      await this.stopService();
    } else {
      await this.startService();
    }
  }

  build() {
    Column()
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Center)
      .justifyContent(VerticalAlign.Center) {
        Text('叫醒打呼噜')
          .fontSize(28)
          .fontWeight(FontWeight.Bold)
          .margin({ bottom: 24 })
        Button({ type: ButtonType.Capsule, stateEffect: true }) {
          Text(this.detecting ? '停止检测' : '开始检测')
            .fontSize(20)
            .fontColor(Color.White)
        }
          .backgroundColor(this.detecting ? Color.Red : Color.Green)
          .padding({ left: 24, right: 24, top: 12, bottom: 12 })
          .onClick(() => {
            // Avoid unhandled promise rejections.  Fire and forget.
            this.toggleDetection();
          })
      }
  }
}
