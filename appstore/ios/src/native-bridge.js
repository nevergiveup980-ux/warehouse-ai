import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();
document.documentElement.dataset.runluNative = isNative ? '1' : '0';

async function safe(action) {
  try { return await action(); }
  catch (error) { console.warn('RUNLU native bridge:', error); return null; }
}

window.RUNLU_NATIVE = Object.freeze({
  isNative,
  platform: Capacitor.getPlatform(),
  appInfo: () => safe(() => App.getInfo()),
  hapticLight: () => safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  hapticSuccess: () => safe(() => Haptics.notification({ type: NotificationType.Success })),
  hapticWarning: () => safe(() => Haptics.notification({ type: NotificationType.Warning })),
  shareText: (title, text) => safe(() => Share.share({ title, text, dialogTitle: title })),
  takePhoto: () => safe(() => Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    saveToGallery: false
  }))
});

function publicDistributionCleanup() {
  document.querySelector('#headerCloudPill')?.remove();
  for (const row of document.querySelectorAll('.settingRow')) {
    const name = row.querySelector('.name')?.textContent?.trim();
    if (name === 'Cloud Sync' || name === 'Carpet Management Link') row.remove();
  }
}

publicDistributionCleanup();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', publicDistributionCleanup, { once: true });

if (isNative) {
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button || button.disabled) return;
    if (button.classList.contains('red')) window.RUNLU_NATIVE.hapticWarning();
    else window.RUNLU_NATIVE.hapticLight();
  }, { passive: true });
}
