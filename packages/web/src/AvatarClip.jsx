// Avatar Teacher playback, AV5 (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §4.3, §11, §13, §19). A teacher
// clip is a video card on the canvas (operation.op 'avatar_clip'); Play opens it in a small viewer-local window at
// the canvas's lower right: the transparent WebM, cropped to the teacher, where alpha renders, and the opaque MP4
// in a rounded card in WebKit. It never autoplays, captions come from the provider's SRT, and while it plays with
// Voice Mode on, the Tutor's speech and the mic are held (voice-session.js hold()).
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Captions, CaptionsOff, Pause, Play, X } from 'lucide-react';
import { alphaPlayback, avatarClipLine, cropBox, cropStyle, pickSource, placeWindow, srtToVtt } from './avatar-clip.js';

// ponytail: the 720p 16:9 render every V1 clip uses; a clip records frame once renders differ.
const FRAME = { w: 1280, h: 720 };
// The transparent teacher fades out at the crop's lower edge instead of ending on a hard cut.
const FADE = 'linear-gradient(to bottom, #000 82%, transparent)';
const OVERLAY_WIDTH = 200, CARD_WIDTH = 240;
// Room for the caption line (two lines at most) and the gaps around it, so a cue never pushes the window onto a card.
const CAPTION_ROOM = 60, CAPTION_WIDTH = 260;

let alphaOk = null;
// Once per page: the browser does not change under it.
function useAlpha() {
  if (alphaOk === null) alphaOk = alphaPlayback(navigator.userAgent, navigator, type => document.createElement('video').canPlayType(type));
  return alphaOk;
}

const Playback = createContext(null);

// One clip plays at a time, per canvas. voice is useVoiceSession's object (null without the Tutor).
export function AvatarPlaybackProvider({ voice, children }) {
  const [clip, setClip] = useState(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const voiceOn = !!voice?.on;
  const value = useMemo(() => ({
    clip, voiceOn,
    open: block => setClip({ ...block.avatar_clip, id: block.id, title: block.title }),
    close: () => setClip(null),
    hold: () => voiceRef.current?.hold?.() ?? (() => {}),
  }), [clip, voiceOn]);
  return <Playback.Provider value={value}>{children}</Playback.Provider>;
}

// The canvas card: the teacher's frame as its poster, Play, and the AI disclosure. Off the Learn page (no
// provider, e.g. a shared board) the clip plays in the card itself.
export function AvatarClipPoster({ block }) {
  const playback = useContext(Playback);
  const clip = block.avatar_clip || {};
  const source = pickSource(clip.sources, useAlpha());
  const frame = clip.frame || FRAME;
  const crop = cropStyle(cropBox(clip.subject || { x: 0, y: 0, ...frame }, frame, 16 / 9), frame);
  const active = playback?.clip?.id === block.id;
  if (!source) return <p className="mt-2 text-xs text-ink-2">This teacher clip cannot play in this browser.</p>;
  if (!playback) return <video data-avatar-inline src={source.src} controls playsInline preload="metadata" className="mt-2 w-full rounded-lg border border-line bg-black" onPointerDown={event => event.stopPropagation()} />;
  return (
    <>
      <button type="button" data-avatar-play aria-label={active ? 'Stop the teacher clip' : `Play the teacher clip: ${block.title}`}
        onClick={() => (active ? playback.close() : playback.open(block))} onPointerDown={event => event.stopPropagation()}
        className="group relative mt-2 block w-full cursor-pointer overflow-hidden rounded-lg border border-line bg-hover" style={{ aspectRatio: crop.aspectRatio }}>
        {/* The poster: a still of the teacher at rest (the clip itself opens mid-word), with alpha. Without one, the
            first frame. ponytail: the still is cut by hand for the review clip; AV4 stores one with each render. */}
        {clip.poster
          ? <img src={clip.poster} alt="" aria-hidden="true" draggable={false} style={crop.video} className="pointer-events-none" />
          : <video src={source.src} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} style={crop.video} className="pointer-events-none" />}
        {/* Literal colours: the dark appearance remaps white and black, and this pill sits on video in both themes. */}
        <span className="absolute bottom-2.5 left-2.5 flex">
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-[rgb(0_0_0/0.7)] px-3.5 text-sm font-medium text-[#fff] group-hover:bg-[rgb(0_0_0/0.82)]">
            {active ? <><X size={14} />Playing in the corner</> : <><Play size={14} fill="currentColor" />Play</>}
          </span>
        </span>
      </button>
      <p className="mt-1.5 text-xs text-ink-2">{avatarClipLine(clip)}</p>
    </>
  );
}

// The playing clip, in AdaptiveCanvas's lower-right rail. Nothing while no clip is open.
export function AvatarPip() {
  const playback = useContext(Playback);
  if (!playback?.clip) return null;
  return <PipPlayer key={playback.clip.id} clip={playback.clip} playback={playback} />;
}

// Where the window may go now (§11: never over the focused or selected card), read from the page: the canvas surface,
// the ids AdaptiveCanvas lists on the rail (data-protect: the selection and the armed card) and the card holding
// keyboard focus. The whole window if a spot is clear; else only its control bar (the clip keeps playing); else the bar
// below the canvas. null on a phone, where the window is an in-flow strip that covers nothing.
function measurePlace(section, bar, width, height) {
  const rail = section?.parentElement, surface = rail?.parentElement?.querySelector(':scope > [data-canvas-surface]');
  if (!surface || !bar || getComputedStyle(section).position !== 'absolute') return null;
  const area = surface.getBoundingClientRect(), size = { w: Math.round(area.width), h: Math.round(area.height) };
  const ids = (rail.dataset.protect || '').split(' ').filter(Boolean).map(id => CSS.escape(id));
  const cards = ids.map(id => surface.querySelector(`[data-block-id="${id}"],[data-item-id="${id}"],[data-shape-id="${id}"]`));
  const blocked = [...cards, document.activeElement?.closest?.('[data-block-id]')].filter(card => card && surface.contains(card))
    .map(card => card.getBoundingClientRect()).map(rect => ({ x: rect.left - area.left, y: rect.top - area.top, w: rect.width, h: rect.height }));
  const controls = { w: Math.ceil(bar.offsetWidth), h: Math.ceil(bar.offsetHeight) };
  const whole = { w: Math.max(width, CAPTION_WIDTH, controls.w), h: Math.ceil(height + CAPTION_ROOM + controls.h) };
  const spot = placeWindow(size, whole, blocked);
  if (spot) return { ...spot, ...whole, surface: size.w, tucked: false };
  const small = placeWindow(size, controls, blocked);
  return small ? { ...small, ...controls, surface: size.w, tucked: true } : { docked: true, tucked: true, bar: controls.h };
}

function PipPlayer({ clip, playback }) {
  const source = pickSource(clip.sources, useAlpha());
  const overlay = !!source?.alpha;
  const frame = clip.frame || FRAME;
  const box = overlay ? clip.subject : cropBox(clip.subject, frame, 16 / 9);
  const crop = cropStyle(box, frame), width = overlay ? OVERLAY_WIDTH : CARD_WIDTH;
  const video = useRef(null), track = useRef(null), section = useRef(null), bar = useRef(null);
  const [place, setPlace] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [cue, setCue] = useState('');
  const [vtt, setVtt] = useState(null);

  // The provider's SRT as a WebVTT track; its cues render below the teacher (readable on any canvas), not on the video.
  useEffect(() => {
    if (!clip.captions) return undefined;
    let url = null, live = true;
    fetch(clip.captions).then(response => (response.ok ? response.text() : '')).then(text => {
      if (!live || !text) return;
      url = URL.createObjectURL(new Blob([srtToVtt(text)], { type: 'text/vtt' }));
      setVtt(url);
    }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [clip.captions]);
  useEffect(() => {
    const text = track.current?.track;
    if (!text) return undefined;
    text.mode = 'hidden';
    const show = () => setCue([...(text.activeCues || [])].map(active => active.text).join(' '));
    text.addEventListener('cuechange', show);
    return () => text.removeEventListener('cuechange', show);
  }, [vtt]);
  // §4.3: held exactly while the clip plays with Voice Mode on - pause, end and close release it.
  useEffect(() => (playing ? playback.hold() : undefined), [playing, playback.voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened by the learner's Play: it starts now, with sound. Never on its own (§19).
  useEffect(() => { video.current?.play().catch(() => setPlaying(false)); }, []);
  // Cards move with the camera, the learner's drags and the selection, so the spot is re-checked every frame; a change
  // re-renders. ponytail: one rAF loop while a clip is open; an event-driven version only if profiling ever asks.
  useEffect(() => {
    let frame = 0, last = '';
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const next = measurePlace(section.current, bar.current, width, width * box.h / box.w);
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setPlace(next); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [width, box.w, box.h]);

  const toggle = () => (video.current.paused ? video.current.play().catch(() => {}) : video.current.pause());
  const close = () => { video.current?.pause(); playback.close(); };
  if (!source) return null;
  const button = 'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink';
  // The window's box is reserved space only: clicks fall through it to the canvas, never through its controls.
  const where = !place ? undefined : place.docked ? { left: 'auto', top: 'auto', right: 12, bottom: -(place.bar + 10) }
    : { left: place.x - place.surface, top: place.y, right: 'auto', bottom: 'auto', width: place.w, height: place.h };
  const tucked = !!place?.tucked;
  return (
    <section ref={section} aria-label={`Teacher clip: ${clip.title}`} data-avatar-pip data-presentation={overlay ? 'overlay' : 'card'} data-playing={playing ? '' : undefined}
      data-place={!place ? 'default' : place.docked ? 'docked' : tucked ? 'tucked' : 'open'} onKeyDown={event => { if (event.key === 'Escape') close(); }} style={where}
      className="pointer-events-none absolute right-3 bottom-3 flex w-max flex-col items-end justify-end gap-1.5 @max-[640px]:relative @max-[640px]:right-auto @max-[640px]:bottom-auto @max-[640px]:items-center @max-[640px]:py-2">
      <div className={`pointer-events-auto relative overflow-hidden ${tucked ? 'hidden' : ''} ${overlay ? '' : 'rounded-xl border border-line bg-black shadow-pop'}`}
        style={{ width, aspectRatio: crop.aspectRatio, ...(overlay ? { maskImage: FADE, WebkitMaskImage: FADE } : {}) }}>
        <video ref={video} src={source.src} playsInline preload="auto" style={crop.video}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}>
          {vtt && <track ref={track} kind="captions" srcLang="en" label="English" src={vtt} default />}
        </video>
      </div>
      {captionsOn && cue && !tucked && <p data-avatar-caption className="pointer-events-auto max-w-[260px] rounded-md bg-[rgb(0_0_0/0.78)] px-2 py-1 text-[13px] leading-[18px] text-[#fff]">{cue}</p>}
      <div ref={bar} className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-white px-1 py-0.5 shadow-pop">
        <button type="button" aria-label={playing ? 'Pause the teacher clip' : 'Play the teacher clip'} onClick={toggle} className={button}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <button type="button" aria-label={captionsOn ? 'Hide captions' : 'Show captions'} aria-pressed={captionsOn} disabled={!vtt} onClick={() => setCaptionsOn(!captionsOn)} className={`${button} disabled:cursor-default disabled:opacity-40`}>
          {captionsOn ? <Captions size={15} /> : <CaptionsOff size={15} />}
        </button>
        <span className="px-1.5 text-[11px] whitespace-nowrap text-ink-2">Teacher · AI-generated</span>
        <button type="button" aria-label="Close the teacher clip" onClick={close} className={button}><X size={14} /></button>
      </div>
    </section>
  );
}
