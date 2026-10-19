/**
 * Draws one slide. The same component renders thumbnails, the operator's
 * preview/live monitors and the projector itself, so what the operator sees
 * is exactly what the congregation sees — at any resolution or aspect ratio.
 *
 * Sizes in themes are expressed for a 1080-pixel-tall screen and scaled to
 * the actual height; text automatically shrinks to fit its box.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Slide, Theme } from '../../shared/types';
import { splitVerseMarkers } from '../../shared/slides';

export type SlideRole = 'thumb' | 'monitor' | 'output';

export interface SlideViewProps {
  slide: Slide | null;
  /** Theme used for the background when nothing is shown (null slide). */
  idleTheme?: Theme | null;
  black?: boolean;
  clear?: boolean;
  role: SlideRole;
  mediaUrl: (path: string) => string;
  media?: { playing: boolean; token: number };
  onMediaError?: (path: string, message: string) => void;
  className?: string;
}

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function backgroundStyle(theme: Theme): CSSProperties {
  const bg = theme.background;
  if (bg.type === 'gradient') return { background: `linear-gradient(${bg.angle}deg, ${bg.color}, ${bg.color2})` };
  return { background: bg.color || '#000' };
}

function textShadow(theme: Theme, scale: number): string | undefined {
  const parts: string[] = [];
  if (theme.outline) {
    const w = Math.max(0.5, theme.outlineWidth * scale);
    const c = theme.outlineColor;
    parts.push(`${-w}px ${-w}px 0 ${c}`, `${w}px ${-w}px 0 ${c}`, `${-w}px ${w}px 0 ${c}`, `${w}px ${w}px 0 ${c}`);
  }
  if (theme.shadow) parts.push(`0 ${Math.max(1, 3 * scale)}px ${Math.max(1, theme.shadowBlur * scale)}px ${theme.shadowColor}`);
  return parts.length ? parts.join(', ') : undefined;
}

/** Shrinks the font size until the content fits inside its box. */
function useFitText(deps: unknown[], maxSize: number, enabled: boolean) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(maxSize);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !enabled || maxSize <= 0) {
      setSize(maxSize);
      return;
    }
    const inner = box.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const fits = (s: number) => {
      inner.style.fontSize = `${s}px`;
      return inner.scrollHeight <= box.clientHeight + 1 && inner.scrollWidth <= box.clientWidth + 1;
    };
    if (fits(maxSize)) {
      setSize(maxSize);
      return;
    }
    let lo = Math.max(4, maxSize * 0.15);
    let hi = maxSize;
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    inner.style.fontSize = `${lo}px`;
    setSize(lo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, maxSize, enabled]);
  return [boxRef, size] as const;
}

/** Thumbnails keep a readable minimum size so operators can recognise each slide. */
const THUMB_MIN_FONT = 11;

function SlideText({ slide, theme, scale, role }: { slide: Slide; theme: Theme; scale: number; role: SlideRole }) {
  const hasTitle = Boolean(slide.title);
  const fontSize = role === 'thumb' ? Math.max(theme.fontSize * scale, THUMB_MIN_FONT) : theme.fontSize * scale;
  const [boxRef, fitted] = useFitText([slide.text, slide.title, theme, scale], fontSize, scale > 0);
  const justify = theme.vAlign === 'top' ? 'flex-start' : theme.vAlign === 'bottom' ? 'flex-end' : 'center';
  const style: CSSProperties = {
    fontFamily: theme.fontFamily,
    fontWeight: theme.fontWeight,
    fontStyle: theme.italic ? 'italic' : 'normal',
    textTransform: theme.uppercase ? 'uppercase' : 'none',
    color: theme.color,
    textAlign: theme.align,
    lineHeight: theme.lineHeight,
    textShadow: textShadow(theme, scale),
    fontSize: `${fitted}px`,
  };
  const titleRatio = theme.titleSize / theme.fontSize;
  const parts = splitVerseMarkers(slide.text);
  return (
    <div
      className="fv-textbox"
      ref={boxRef}
      style={{
        left: `${theme.marginX}%`,
        right: `${theme.marginX}%`,
        top: `${theme.marginTop}%`,
        bottom: `${theme.marginBottom}%`,
        justifyContent: justify,
      }}
    >
      <div className="fv-text" style={style}>
        {hasTitle && (
          <div className="fv-title" style={{ fontSize: `${titleRatio}em`, color: theme.titleColor, marginBottom: slide.text ? '0.35em' : 0 }}>
            {slide.title}
          </div>
        )}
        {slide.text && (
          <div className="fv-body">
            {parts.map((p, i) =>
              p.verse ? (
                <sup key={i} className="fv-verse">
                  {p.verse}
                </sup>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoLayer({
  path,
  url,
  role,
  loop,
  muted,
  media,
  onError,
}: {
  path: string;
  url: string;
  role: SlideRole;
  loop: boolean;
  muted: boolean;
  media?: { playing: boolean; token: number };
  onError?: (path: string, message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const isOutput = role === 'output';
  // Restart from the beginning when the operator (re)starts this video.
  useEffect(() => {
    const v = ref.current;
    if (!v || !isOutput) return;
    v.currentTime = 0;
  }, [media?.token, isOutput]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !isOutput) return;
    if (media?.playing) {
      v.play().catch((err: Error) => {
        // Decoding problems are reported once by the 'error' event below; only report other refusals here.
        if (err.name === 'NotAllowedError') onError?.(path, err.message);
      });
    } else v.pause();
  }, [media?.playing, media?.token, isOutput, path, onError]);
  return (
    <video
      ref={ref}
      className="fv-media"
      src={url}
      loop={loop}
      muted={!isOutput || muted}
      playsInline
      preload={isOutput ? 'auto' : 'metadata'}
      onError={() => {
        const err = ref.current?.error;
        const reasons: Record<number, string> = {
          1: 'playback aborted',
          2: 'network/file error',
          3: 'the video could not be decoded',
          4: 'this format or codec is not supported (use MP4 H.264 or WebM)',
        };
        if (isOutput) onError?.(path, err ? (reasons[err.code] ?? err.message) : 'unknown error');
      }}
    />
  );
}

export function SlideView({ slide, idleTheme, black, clear, role, mediaUrl, media, onMediaError, className }: SlideViewProps) {
  const [ref, size] = useBoxSize<HTMLDivElement>();
  const theme = slide?.theme ?? idleTheme ?? null;
  const scale = size.height / 1080;
  const bg = theme?.background;
  const showText = slide && !clear && (slide.kind === 'text' || slide.kind === 'title');
  const fullMedia = slide && (slide.kind === 'image' || slide.kind === 'video');
  const footer = slide && role !== 'thumb' && theme?.showFooter && slide.footer && !clear && slide.kind === 'text';

  return (
    <div ref={ref} className={`fv-slide fv-role-${role} ${className ?? ''}`} style={theme && !fullMedia ? backgroundStyle(theme) : { background: '#000' }}>
      {theme && !fullMedia && bg && (bg.type === 'image' || bg.type === 'video') && bg.mediaPath && (
        bg.type === 'image' ? (
          <img className="fv-media fv-cover" src={mediaUrl(bg.mediaPath)} alt="" draggable={false} />
        ) : (
          <video className="fv-media fv-cover" src={mediaUrl(bg.mediaPath)} autoPlay={role !== 'thumb'} muted loop playsInline />
        )
      )}
      {slide?.mediaPath && !slide.missing && (slide.kind === 'text' || slide.kind === 'title') && (
        <img className="fv-media fv-cover" src={mediaUrl(slide.mediaPath)} alt="" draggable={false} />
      )}
      {theme && !fullMedia && (bg?.dim ?? 0) > 0 && <div className="fv-dim" style={{ opacity: bg!.dim }} />}
      {slide?.mediaPath && (slide.kind === 'text' || slide.kind === 'title') && !slide.missing && <div className="fv-dim" style={{ opacity: 0.35 }} />}

      {slide?.kind === 'image' && slide.mediaPath && !slide.missing && (
        <img className="fv-media fv-contain" src={mediaUrl(slide.mediaPath)} alt="" draggable={false} />
      )}
      {slide?.kind === 'video' && slide.mediaPath && !slide.missing && (
        <VideoLayer
          path={slide.mediaPath}
          url={mediaUrl(slide.mediaPath)}
          role={role}
          loop={slide.loop}
          muted={slide.muted}
          media={media}
          onError={onMediaError}
        />
      )}

      {showText && theme && size.height > 0 && <SlideText slide={slide} theme={theme} scale={scale} role={role} />}
      {footer && theme && (
        <div
          className="fv-footer"
          style={{
            fontSize: `${theme.footerSize * scale}px`,
            color: theme.footerColor,
            fontFamily: theme.fontFamily,
            textAlign: theme.align === 'left' ? 'left' : theme.align === 'right' ? 'right' : 'center',
            left: `${theme.marginX}%`,
            right: `${theme.marginX}%`,
            bottom: `${Math.max(2, theme.marginBottom / 3)}%`,
            textShadow: theme.shadow ? `0 1px ${Math.max(1, 4 * scale)}px rgba(0,0,0,.8)` : undefined,
          }}
        >
          {slide.footer}
        </div>
      )}

      {role !== 'output' && slide?.missing && <div className="fv-badge fv-badge-warn">Missing file</div>}
      {role !== 'output' && slide?.kind === 'video' && !slide.missing && <div className="fv-badge">▶ Video</div>}
      {role !== 'output' && slide?.kind === 'blank' && <div className="fv-badge fv-badge-dim">Blank</div>}
      <div className="fv-black" style={{ opacity: black ? 1 : 0 }} />
    </div>
  );
}
