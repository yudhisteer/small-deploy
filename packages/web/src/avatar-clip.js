// Avatar Teacher playback (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §11, §13, §19; AV5): which render
// a browser plays, the teacher's crop, and the provider's SRT as WebVTT for the browser's text track.

// WebKit (Safari, and every iOS browser, which must use WebKit) plays WebM but ignores its alpha: the teacher
// would show on black, so it gets the opaque MP4 instead (§11; owner, AV5: no black-background WebM fallback).
// canPlay is a video element's canPlayType.
export function alphaPlayback(userAgent = '', { maxTouchPoints = 0, platform = '' } = {}, canPlay = () => '') {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const safari = /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent);
  return !ios && !safari && !!canPlay('video/webm; codecs="vp9"');
}

// The render to play: the alpha WebM where alpha renders, else the opaque MP4. Never an alpha render without
// alpha support (it would play on black), so a clip with no opaque render has nothing to play there.
export function pickSource(sources = [], alpha = false) {
  return (alpha && sources.find(source => source.alpha)) || sources.find(source => !source.alpha) || null;
}

// The crop around the teacher. box and frame are source pixels ({ x, y, w, h } and { w, h }). The teacher's
// head-and-shoulders box comes from the clip's alpha matte (§33.4); a card widens it to `aspect` around its
// centre, inside the frame.
export function cropBox(subject, frame, aspect = null) {
  if (!aspect) return subject;
  const h = Math.min(subject.h, frame.h, frame.w / aspect), w = h * aspect;
  const x = Math.max(0, Math.min(frame.w - w, subject.x + subject.w / 2 - w / 2));
  const y = Math.max(0, Math.min(frame.h - h, subject.y));
  return { x, y, w, h };
}
// The box's aspect ratio and the video's place inside it, in percentages, so one crop serves any box width.
export function cropStyle(box, frame) {
  const pct = value => `${Math.round(value * 10000) / 100}%`;
  return { aspectRatio: `${box.w} / ${box.h}`, video: { position: 'absolute', left: pct(-box.x / box.w), top: pct(-box.y / box.h), width: pct(frame.w / box.w), height: pct(frame.h / box.h), maxWidth: 'none' } };
}

// The provider's SRT (HeyGen's subtitle_url) as WebVTT, which <track> requires: a header, cue numbers dropped,
// a full stop before the milliseconds. The words are the provider's, never rewritten.
export function srtToVtt(srt) {
  const cues = String(srt || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)
    .map(block => block.replace(/^\d+\n(?=\d+:\d\d:\d\d[,.]\d{3}\s+-->)/, '').replace(/(\d+:\d\d:\d\d),(\d{3})/g, '$1.$2'))
    .filter(block => block.includes('-->'));
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

// The card's one line under a teacher clip (§13): its length, what it is, and the AI disclosure HeyGen's terms require.
export const avatarClipLine = clip => `${Math.round(clip?.duration_seconds || 0) || '?'} s · Teacher clip · AI-generated`;
