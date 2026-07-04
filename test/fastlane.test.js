import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fastlanePath } from '../src/fastlane.js';

const j = (...parts) => parts.join(path.sep);

test('app store formats map to deliver screenshots by locale', () => {
  assert.equal(fastlanePath({ store: 'appstore', format: 'iphone', locale: 'en-US', screen: 1, ext: 'png' }),
    j('fastlane', 'screenshots', 'en-US', 'iphone-01.png'));
  assert.equal(fastlanePath({ store: 'appstore', format: 'ipad11', locale: 'en-US', screen: 12, ext: 'jpg' }),
    j('fastlane', 'screenshots', 'en-US', 'ipad11-12.jpg'));
  assert.equal(fastlanePath({ store: 'mac', format: 'mac', locale: 'en-US', screen: 2, ext: 'png' }),
    j('fastlane', 'screenshots', 'en-US', 'mac-02.png'));
  assert.equal(fastlanePath({ store: 'watch', format: 'watch', locale: 'en-US', screen: 3, ext: 'png' }),
    j('fastlane', 'screenshots', 'en-US', 'watch-03.png'));
});

test('play formats map to supply metadata layout', () => {
  assert.equal(fastlanePath({ store: 'play', format: 'aphone', locale: 'en-US', screen: 1, ext: 'png' }),
    j('fastlane', 'metadata', 'android', 'en-US', 'images', 'phoneScreenshots', '01.png'));
  assert.equal(fastlanePath({ store: 'play', format: 'atablet', locale: 'en-US', screen: 4, ext: 'png' }),
    j('fastlane', 'metadata', 'android', 'en-US', 'images', 'tenInchScreenshots', '04.png'));
});

test('feature graphic is a single fixed-name file', () => {
  assert.equal(fastlanePath({ store: 'play', format: 'feature', locale: 'en-US', screen: 1, ext: 'png' }),
    j('fastlane', 'metadata', 'android', 'en-US', 'images', 'featureGraphic.png'));
});

test('locales flow through both layouts', () => {
  assert.match(fastlanePath({ store: 'appstore', format: 'iphone', locale: 'ar-SA', screen: 1, ext: 'png' }), /ar-SA/);
  assert.match(fastlanePath({ store: 'play', format: 'aphone', locale: 'ar-SA', screen: 1, ext: 'png' }), /ar-SA/);
});
