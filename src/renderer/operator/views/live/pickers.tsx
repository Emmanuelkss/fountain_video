/** Modals used to add items to the service. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BibleTranslation, MediaItem, MediaKind, ServiceItem, SongSummary } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Empty, Icon, Modal } from '../../components/ui';
import { ANNOUNCEMENT_PRESETS, announcementItem, bibleItem, mediaItem, songItem } from '../../itemFactory';
import { IMAGE_EXTS, VIDEO_EXTS } from '../../fileTypes';

export function SongPicker({ onPick, onClose }: { onPick: (items: ServiceItem[], show: boolean) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<{ query: string; list: SongSummary[] } | null>(null);
  // Enter pressed before the results for the latest typing arrived: pick once they do.
  const pendingEnter = useRef<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api()
      .invoke('songs.list', { query })
      .then((list) => !cancelled && setResults({ query, list }));
    return () => {
      cancelled = true;
    };
  }, [query]);
  const list = results?.list ?? [];
  const fresh = results?.query === query;
  useEffect(() => setActive(0), [query]);
  const pick = (song: SongSummary | undefined, show: boolean) => song && onPick([songItem(song)], show);
  useEffect(() => {
    if (fresh && pendingEnter.current !== null) {
      const show = pendingEnter.current;
      pendingEnter.current = null;
      pick(list[0], show);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, list]);
  return (
    <Modal title="Add a song" onClose={onClose} wide>
      <div className="picker">
        <div className="search-box">
          <Icon name="search" />
          <input
            autoFocus
            placeholder="Search by title, words or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(list.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (fresh) pick(list[active], e.ctrlKey);
                else pendingEnter.current = e.ctrlKey;
              }
            }}
          />
        </div>
        <p className="hint">Enter adds the song · Ctrl+Enter adds it and shows it immediately</p>
        <div className="picker-list" role="listbox">
          {list.length === 0 && <Empty icon="songs" title={query ? 'No song matches your search' : 'Your song library is empty'} />}
          {list.map((s, i) => (
            <div
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={`picker-row ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onDoubleClick={() => pick(s, false)}
            >
              <div className="picker-main">
                <strong>{s.title}</strong>
                <span className="muted">{s.firstLine}</span>
              </div>
              <div className="picker-actions">
                <button className="btn btn-small" onClick={() => pick(s, false)}>
                  Add
                </button>
                <button className="btn btn-small btn-live" onClick={() => pick(s, true)}>
                  Add &amp; show
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function BiblePicker({ onPick, onClose }: { onPick: (items: ServiceItem[], show: boolean) => void; onClose: () => void }) {
  const { settings } = useStore();
  const [translations] = useData<BibleTranslation[]>(['bible'], () => api().invoke('bible.translations', undefined));
  const [translationId, setTranslationId] = useState<string>('');
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<{ reference: string; error: string | null; count: number; preview: string } | null>(null);
  const [versesPerSlide, setVersesPerSlide] = useState(settings?.defaultVersesPerSlide ?? 1);

  useEffect(() => {
    if (!translationId && translations && translations.length > 0) {
      setTranslationId(settings?.defaultTranslationId && translations.some((t) => t.id === settings.defaultTranslationId) ? settings.defaultTranslationId : translations[0]!.id);
    }
  }, [translations, translationId, settings?.defaultTranslationId]);

  useEffect(() => {
    if (!translationId || !reference.trim()) {
      setResult(null);
      return undefined;
    }
    const handle = window.setTimeout(() => {
      void api()
        .invoke('bible.lookup', { translationId, reference })
        .then((r) =>
          setResult({
            reference: r.reference,
            error: r.error,
            count: r.verses.length,
            preview: r.verses
              .slice(0, 3)
              .map((v) => `${v.verse} ${v.text}`)
              .join(' '),
          }),
        );
    }, 150);
    return () => window.clearTimeout(handle);
  }, [translationId, reference]);

  const add = (show: boolean) => {
    if (!result || result.error) return;
    onPick([bibleItem(translationId, result.reference, versesPerSlide)], show);
  };

  if (translations && translations.length === 0) {
    return (
      <Modal title="Add a Bible passage" onClose={onClose}>
        <Empty icon="bible" title="No Bible installed">
          Import a Bible translation in the Bible tab first.
        </Empty>
      </Modal>
    );
  }
  return (
    <Modal
      title="Add a Bible passage"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!result || Boolean(result.error)} onClick={() => add(false)}>
            Add
          </button>
          <button className="btn btn-live" disabled={!result || Boolean(result.error)} onClick={() => add(true)}>
            Add &amp; show
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Translation</span>
          <select value={translationId} onChange={(e) => setTranslationId(e.target.value)}>
            {(translations ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbreviation} — {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Verses per slide</span>
          <select value={versesPerSlide} onChange={(e) => setVersesPerSlide(Number(e.target.value))}>
            <option value={0}>Automatic (by length)</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span className="field-label">Reference</span>
          <input
            autoFocus
            placeholder="e.g. John 3:16-18, Ps 23, Jean 3.16"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(e.ctrlKey)}
          />
        </label>
      </div>
      {result && (
        <div className={`lookup ${result.error ? 'lookup-error' : ''}`}>
          {result.error ? (
            result.error
          ) : (
            <>
              <strong>
                {result.reference} · {result.count} verse{result.count === 1 ? '' : 's'}
              </strong>
              <p>{result.preview}…</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function MediaPicker({ kind, onPick, onClose }: { kind: MediaKind; onPick: (items: ServiceItem[], show: boolean) => void; onClose: () => void }) {
  const { call, mediaUrl, toast } = useStore();
  const [media, reload] = useData<MediaItem[]>(['media'], () => api().invoke('media.list', undefined));
  const list = (media ?? []).filter((m) => m.kind === kind);
  const importFiles = async () => {
    const paths = await call('dialog.openFiles', {
      title: kind === 'image' ? 'Import images' : 'Import videos',
      filters: [{ name: kind === 'image' ? 'Images' : 'Videos', extensions: kind === 'image' ? IMAGE_EXTS : VIDEO_EXTS }],
      multiple: true,
    });
    if (paths.length === 0) return;
    const report = await call('media.import', { paths });
    report.errors.forEach((e) => toast('warn', e));
    if (report.imported) toast('success', `${report.imported} file${report.imported === 1 ? '' : 's'} imported`);
    reload();
  };
  return (
    <Modal
      title={kind === 'image' ? 'Add an image' : 'Add a video'}
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={importFiles}>
          <Icon name="import" /> Import files…
        </button>
      }
    >
      {list.length === 0 ? (
        <Empty icon={kind} title={`No ${kind}s in the media library`}>
          Use “Import files…” to add {kind === 'image' ? 'pictures (JPG, PNG…)' : 'videos (MP4, WebM…)'}.
        </Empty>
      ) : (
        <div className="media-grid">
          {list.map((m) => (
            <div key={m.id} className={`media-card ${m.exists === false ? 'missing' : ''}`}>
              <div className="media-thumb">
                {m.exists === false ? (
                  <span className="warn">Missing file</span>
                ) : m.kind === 'image' ? (
                  <img src={mediaUrl(m.path)} alt="" loading="lazy" />
                ) : (
                  <video src={mediaUrl(m.path)} muted preload="metadata" />
                )}
              </div>
              <div className="media-name" title={m.name}>
                {m.name}
              </div>
              <div className="media-actions">
                <button className="btn btn-small" disabled={m.exists === false} onClick={() => onPick([mediaItem(m)], false)}>
                  Add
                </button>
                <button className="btn btn-small btn-live" disabled={m.exists === false} onClick={() => onPick([mediaItem(m)], true)}>
                  Add &amp; show
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function AnnouncementPicker({ onPick, onClose }: { onPick: (items: ServiceItem[], edit: boolean) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => first.current?.focus(), []);
  const presets = useMemo(() => ANNOUNCEMENT_PRESETS, []);
  return (
    <Modal title="Add an announcement" onClose={onClose}>
      <div className="preset-list">
        {presets.map((p, i) => (
          <button key={p.key} ref={i === 0 ? first : undefined} className="preset" onClick={() => onPick([announcementItem(p)], true)}>
            <strong>{p.label}</strong>
            <span className="muted">{p.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
