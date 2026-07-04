import path from 'node:path';

// Maps a rendered screen into the directory layout fastlane expects.
// App Store (deliver): screenshots/<locale>/ — the device slot is inferred
// from image dimensions, so filenames stay simple. Play (supply):
// metadata/android/<locale>/images/, with the feature graphic as a single
// fixed-name file and tablet shots split by size class.
const PLAY_DIRS = {
  aphone: 'phoneScreenshots',
  atablet: 'tenInchScreenshots', // 1600×2560 is 10"-class
};

export function fastlanePath({ store, format, locale, screen, ext }) {
  const nn = String(screen).padStart(2, '0');
  if (store === 'play') {
    if (format === 'feature') {
      return path.join('fastlane', 'metadata', 'android', locale, 'images', `featureGraphic.${ext}`);
    }
    const dir = PLAY_DIRS[format] || 'phoneScreenshots';
    return path.join('fastlane', 'metadata', 'android', locale, 'images', dir, `${nn}.${ext}`);
  }
  return path.join('fastlane', 'screenshots', locale, `${format}-${nn}.${ext}`);
}
