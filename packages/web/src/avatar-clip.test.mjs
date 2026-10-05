import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaPlayback, avatarClipLine, cropBox, cropStyle, pickSource, placeWindow, srtToVtt } from './avatar-clip.js';

const vp9 = type => (type.startsWith('video/webm') ? 'probably' : '');
const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
};

test('alpha WebM only where alpha renders: never WebKit (Safari, every iOS browser, iPadOS) or without VP9', () => {
  assert.equal(alphaPlayback(UA.chrome, {}, vp9), true);
  assert.equal(alphaPlayback(UA.edge, {}, vp9), true);
  assert.equal(alphaPlayback(UA.firefox, {}, vp9), true);
  assert.equal(alphaPlayback(UA.safari, {}, vp9), false);
  assert.equal(alphaPlayback(UA.iphoneChrome, {}, vp9), false);
  assert.equal(alphaPlayback(UA.safari.replace('Macintosh; Intel Mac OS X 10_15_7', 'Macintosh'), { platform: 'MacIntel', maxTouchPoints: 5 }, vp9), false, 'iPadOS reports a Mac');
  assert.equal(alphaPlayback(UA.chrome, {}, () => ''), false, 'no VP9: the opaque render');
});

test('the source: alpha WebM with alpha support, else the opaque MP4, never a black-background WebM', () => {
  const webm = { src: 'a.webm', type: 'video/webm', alpha: true }, mp4 = { src: 'a.mp4', type: 'video/mp4' };
  assert.equal(pickSource([webm, mp4], true), webm);
  assert.equal(pickSource([webm, mp4], false), mp4);
  assert.equal(pickSource([mp4], true), mp4);
  assert.equal(pickSource([webm], false), null);
});

test('crop: the teacher box as is, or widened to 16:9 around its centre inside the frame', () => {
  const frame = { w: 1280, h: 720 }, subject = { x: 432, y: 16, w: 504, h: 420 };
  assert.deepEqual(cropBox(subject, frame), subject);
  const card = cropBox(subject, frame, 16 / 9);
  assert.equal(Math.round(card.w / card.h * 9), 16);
  assert.equal(card.x + card.w / 2, 684, 'centred on the teacher');
  const edge = cropBox({ x: 1100, y: 0, w: 180, h: 300 }, frame, 16 / 9);
  assert.equal(Math.round(edge.x + edge.w), 1280, 'kept inside the frame');
  assert.deepEqual(cropStyle(subject, frame), { aspectRatio: '504 / 420', video: { position: 'absolute', left: '-85.71%', top: '-3.81%', width: '253.97%', height: '171.43%', maxWidth: 'none' } });
});

test('captions: the provider SRT becomes WebVTT with its words unchanged', () => {
  const srt = '﻿1\r\n00:00:00,260 --> 00:00:01,600\r\nWelcome to attention.\r\n\r\n2\r\n00:00:02,050 --> 00:00:04,310\r\nHere, each character looks back at the\r\n\r\n3\n00:00:04,350 --> 00:00:06,540\nearlier ones to decide what matters.';
  assert.equal(srtToVtt(srt), 'WEBVTT\n\n00:00:00.260 --> 00:00:01.600\nWelcome to attention.\n\n00:00:02.050 --> 00:00:04.310\nHere, each character looks back at the\n\n00:00:04.350 --> 00:00:06.540\nearlier ones to decide what matters.\n');
  assert.equal(srtToVtt(''), 'WEBVTT\n\n\n');
  assert.equal(avatarClipLine({ duration_seconds: 6.77 }), '7 s · Teacher clip · AI-generated');
});

test('placement: the teacher window never covers a protected card', () => {
  const surface = { w: 1200, h: 800 }, size = { w: 260, h: 280 };
  const overlaps = (spot, card) => spot.x < card.x + card.w && card.x < spot.x + size.w && spot.y < card.y + card.h && card.y < spot.y + size.h;
  assert.deepEqual(placeWindow(surface, size, []), { x: 928, y: 508 }, 'the lower right by default');
  const lowerRight = { x: 800, y: 450, w: 380, h: 330 };
  assert.deepEqual(placeWindow(surface, size, [lowerRight]), { x: 928, y: 12 }, 'then the upper right');
  const rightColumn = { x: 700, y: 0, w: 500, h: 800 };
  assert.deepEqual(placeWindow(surface, size, [rightColumn]), { x: 12, y: 508 }, 'then the lower left');
  // Every corner taken by a separate card: it slides along an edge to the gap between them.
  const corners = [{ x: 0, y: 0, w: 300, h: 300 }, { x: 900, y: 0, w: 300, h: 300 }, { x: 0, y: 500, w: 300, h: 300 }, { x: 900, y: 500, w: 300, h: 300 }];
  const between = placeWindow(surface, size, corners);
  assert.ok(between && corners.every(card => !overlaps(between, card)), JSON.stringify(between));
  // A card filling the canvas leaves nothing: the caller tucks the window away instead of covering it.
  assert.equal(placeWindow(surface, size, [{ x: -50, y: -50, w: 1300, h: 900 }]), null);
  assert.equal(placeWindow({ w: 200, h: 200 }, size, []), null, 'a canvas smaller than the window');
  for (let trial = 0; trial < 200; trial++) {
    const cards = Array.from({ length: 1 + (trial % 4) }, (_, index) => ({ x: (trial * 37 + index * 211) % 1100, y: (trial * 53 + index * 157) % 700, w: 120 + (trial * 13) % 400, h: 90 + (trial * 7) % 300 }));
    const spot = placeWindow(surface, size, cards);
    if (spot) assert.ok(cards.every(card => !overlaps(spot, card)) && spot.x >= 0 && spot.y >= 0 && spot.x + size.w <= surface.w && spot.y + size.h <= surface.h, `trial ${trial}`);
  }
});
