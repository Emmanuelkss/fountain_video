/** Operator window shell: navigation, global keyboard shortcuts, notifications. */
import { useEffect, useRef, useState } from 'react';
import { actionForCombo, comboFromEvent, GLOBAL_ACTIONS, sectionLabelForKey } from '../../shared/shortcuts';
import type { ShortcutAction } from '../../shared/types';
import { api, useStore, type ViewName } from './store';
import { Icon, Modal, Toasts } from './components/ui';
import { LiveView, sendLive } from './views/live/LiveView';
import { SongsView } from './views/songs/SongsView';
import { BibleView } from './views/bible/BibleView';
import { MediaView } from './views/media/MediaView';
import { ThemesView } from './views/themes/ThemesView';
import { ServicesView } from './views/services/ServicesView';
import { SettingsView } from './views/settings/SettingsView';

const NAV: Array<{ view: ViewName; label: string; icon: string }> = [
  { view: 'live', label: 'Live', icon: 'live' },
  { view: 'services', label: 'Services', icon: 'services' },
  { view: 'songs', label: 'Songs', icon: 'songs' },
  { view: 'bible', label: 'Bible', icon: 'bible' },
  { view: 'media', label: 'Media', icon: 'media' },
  { view: 'themes', label: 'Themes', icon: 'themes' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(type);
  }
  return false;
}

function useGlobalShortcuts() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;

  useEffect(() => {
    const run = (action: ShortcutAction) => {
      const s = ref.current;
      switch (action) {
        case 'nextSlide':
          return sendLive({ type: 'next' });
        case 'prevSlide':
          return sendLive({ type: 'prev' });
        case 'nextSection':
          return sendLive({ type: 'nextSection' });
        case 'prevSection':
          return sendLive({ type: 'prevSection' });
        case 'nextItem':
          return sendLive({ type: 'nextItem' });
        case 'prevItem':
          return sendLive({ type: 'prevItem' });
        case 'black':
          return sendLive({ type: 'black' });
        case 'clear':
          return sendLive({ type: 'clear' });
        case 'mediaToggle':
          return sendLive({ type: 'mediaToggle' });
        case 'toggleOutput':
          return s.call('output.toggle', undefined);
        case 'exitOutput':
          return s.call('output.close', undefined);
        case 'searchSong':
          if (s.view !== 'live' && s.view !== 'songs') s.setView(s.deck.serviceId ? 'live' : 'songs');
          s.requestSearch();
          return undefined;
        case 'goLive':
          if (s.selectedItemId) return sendLive({ type: 'go', itemId: s.selectedItemId, slideIndex: 0 });
          return undefined;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.dataset?.shortcutRecorder) return;
      const s = ref.current;
      if (!s.settings) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const modalOpen = Boolean(document.querySelector('.modal-backdrop'));
      const typing = isTypingTarget(e.target) || modalOpen;
      const action = actionForCombo(combo, s.settings.shortcuts);
      // Let buttons and links keep their normal Enter/Space behaviour.
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'A') && (combo === 'Enter' || combo === 'Space')) return;
      if (action) {
        if (typing && !GLOBAL_ACTIONS.includes(action)) return;
        if (action === 'goLive' && s.view !== 'live') return;
        e.preventDefault();
        void Promise.resolve(run(action)).catch(() => undefined);
        return;
      }
      if (typing || e.repeat) return;
      const label = sectionLabelForKey(e);
      if (label && s.live.itemId) {
        e.preventDefault();
        void sendLive({ type: 'jumpLabel', label }).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function Welcome({ onClose }: { onClose: () => void }) {
  const { setView } = useStore();
  return (
    <Modal
      title="Welcome to FountainVideo"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" autoFocus onClick={onClose}>
          Get started
        </button>
      }
    >
      <div className="welcome">
        <p>Everything works offline and is saved automatically on this computer. To help you start, we added:</p>
        <ul>
          <li>5 public-domain hymns in the <strong>Songs</strong> tab,</li>
          <li>a short sample of the King James Version and Louis Segond 1910 — import a full Bible in the <strong>Bible</strong> tab,</li>
          <li>a “Sunday Service” template in <strong>Services</strong>.</li>
        </ul>
        <p>Typical Sunday:</p>
        <ol>
          <li>
            <button className="btn-link" onClick={() => (setView('services'), onClose())}>
              Services
            </button>{' '}
            → New service (from the template).
          </li>
          <li>Add songs, Bible passages, announcements, pictures and videos with “Add”, drag to reorder.</li>
          <li>
            Connect the projector (Windows: <kbd>Win</kbd>+<kbd>P</kbd> → Extend) and press <kbd>F5</kbd> to turn it on.
          </li>
          <li>
            Click a slide to show it. <kbd>→</kbd>/<kbd>Space</kbd> next, <kbd>←</kbd> previous, <kbd>.</kbd> black screen.
          </li>
        </ol>
      </div>
    </Modal>
  );
}

export function App() {
  const { view, setView, output, info, deck, live } = useStore();
  const [welcome, setWelcome] = useState(false);
  useGlobalShortcuts();
  useEffect(() => {
    if (info?.firstRun) setWelcome(true);
  }, [info?.firstRun]);

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand" title={`FountainVideo ${info?.version ?? ''}`}>
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <path d="M16 3c4 6 8 9.5 8 14.5a8 8 0 0 1-16 0C8 12.5 12 9 16 3z" fill="var(--accent)" />
            <path d="M16 13c2 3 4 4.7 4 7.3a4 4 0 0 1-8 0c0-2.6 2-4.3 4-7.3z" fill="var(--nav-bg)" />
          </svg>
        </div>
        {NAV.map((n) => (
          <button key={n.view} className={`nav-btn ${view === n.view ? 'active' : ''}`} onClick={() => setView(n.view)} aria-current={view === n.view}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <div className="nav-spacer" />
        <button
          className={`nav-btn projector-btn ${output.open ? 'on' : ''}`}
          onClick={() => void api().invoke('output.toggle', undefined)}
          title={output.open ? 'Projector is on (F5 to turn off)' : 'Projector is off (F5 to turn on)'}
        >
          <Icon name="projector" size={20} />
          <span>{output.open ? 'ON AIR' : 'Off'}</span>
        </button>
      </nav>
      <main className="main">
        {view !== 'live' && output.open && (
          <div className="live-strip" onClick={() => setView('live')} role="button">
            <span className="live-pill">LIVE</span> {deck.serviceName} — {live.black ? 'black screen' : live.slide ? live.slide.label || 'slide' : 'nothing shown'} · click to return to Live
          </div>
        )}
        {view === 'live' && <LiveView />}
        {view === 'services' && <ServicesView />}
        {view === 'songs' && <SongsView />}
        {view === 'bible' && <BibleView />}
        {view === 'media' && <MediaView />}
        {view === 'themes' && <ThemesView />}
        {view === 'settings' && <SettingsView />}
      </main>
      <Toasts />
      {welcome && <Welcome onClose={() => setWelcome(false)} />}
    </div>
  );
}
