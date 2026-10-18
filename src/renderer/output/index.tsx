/**
 * Projector (audience) window. Renders only what the main process says is
 * live. Updates carry a sequence number; anything older than what is already
 * on screen is ignored, so fast clicking can never leave the projector out of
 * sync.
 */
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OutputApi } from '../../shared/api';
import type { LiveState } from '../../shared/live';
import { SlideView } from '../common/SlideView';
import '../common/slide.css';
import './output.css';

declare global {
  interface Window {
    fountainOutput: OutputApi;
  }
}

function Output() {
  const api = window.fountainOutput;
  const [state, setState] = useState<LiveState | null>(null);

  useEffect(() => {
    let latest = -1;
    const apply = (next: LiveState) => {
      // The main process increments seq on every change: anything older is stale.
      if (next.seq < latest) return;
      latest = next.seq;
      setState(next);
      document.body.dataset.seq = String(next.seq);
    };
    const off = api.onState(apply);
    api
      .ready()
      .then((initial) => apply(initial.state))
      .catch(() => undefined);
    return off;
  }, [api]);

  const onMediaError = useCallback((path: string, message: string) => api.reportMediaError(path, message), [api]);
  const mediaUrl = useCallback((p: string) => api.mediaUrl(p), [api]);

  // Hide the cursor on the projector.
  useEffect(() => {
    document.body.style.cursor = 'none';
  }, []);

  if (!state) return <div className="fv-output-black" />;
  return (
    <SlideView
      role="output"
      slide={state.slide}
      black={state.black || !state.slide}
      clear={state.clear}
      media={state.media}
      mediaUrl={mediaUrl}
      onMediaError={onMediaError}
      className="fv-output"
    />
  );
}

createRoot(document.getElementById('root')!).render(<Output />);
