import UIAbility from '@ohos.app.ability.UIAbility';
import common from '@ohos.app.ability.common';

/**
 * EntryAbility is the entry point of the application.  It presents
 * a simple user interface that allows the user to start and stop
 * the snoring detection service.  Most of the business logic is
 * implemented in the SnoreServiceAbility; this ability simply
 * forwards user actions to the service via explicit Wants.
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: common.Want, launchParam: common.LaunchParam): void {
    console.info('EntryAbility onCreate');
    // No special setup is required here because the UI is built
    // declaratively in index.ets.  The ability lifecycle methods
    // remain available for customisation if needed.
  }

  onDestroy(): void {
    console.info('EntryAbility onDestroy');
  }
}
