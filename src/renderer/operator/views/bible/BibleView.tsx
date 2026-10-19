/** Bible: browse by book/chapter, pick verses, search text, favorites, import translations. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BibleBook, BibleFavorite, BibleTranslation, BibleVerse } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Empty, Field, Icon, Modal, useConfirm } from '../../components/ui';
import { BIBLE_EXTS } from '../../fileTypes';
import { bibleItem } from '../../itemFactory';
import { sendLive } from '../live/LiveView';

export function BibleView() {
  const { call, toast, settings, deck, selectedItemId, setView } = useStore();
  const confirm = useConfirm();
  const [translations] = useData<BibleTranslation[]>(['bible'], () => api().invoke('bible.translations', undefined));
  const [translationId, setTranslationId] = useState('');
  const [books] = useData<BibleBook[]>(['bible'], () => (translationId ? api().invoke('bible.books', { translationId }) : Promise.resolve([])), [translationId]);
  const [book, setBook] = useState<number | null>(null);
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<BibleVerse & { reference: string }>>([]);
  const [favorites] = useData<BibleFavorite[]>(['bible'], () => api().invoke('bible.favorites', undefined));
  const [importing, setImporting] = useState(false);
  const [versesPerSlide, setVersesPerSlide] = useState(settings?.defaultVersesPerSlide ?? 1);
  /** Verse range to select once the requested chapter has loaded. */
  const pendingRange = useRef<{ start: number; end: number } | null>(null);

  const jumpTo = (b: number, c: number, r: { start: number; end: number } | null) => {
    pendingRange.current = r;
    if (b === book && c === chapter) {
      setRange(r);
      pendingRange.current = null;
    } else {
      setBook(b);
      setChapter(c);
    }
  };

  useEffect(() => {
    if (!translations || translations.length === 0) return;
    if (!translations.some((t) => t.id === translationId)) {
      const preferred = translations.find((t) => t.id === settings?.defaultTranslationId) ?? translations[0]!;
      setTranslationId(preferred.id);
    }
  }, [translations, translationId, settings?.defaultTranslationId]);

  useEffect(() => {
    if (books && books.length > 0 && (book === null || !books.some((b) => b.number === book))) {
      setBook(books[0]!.number);
      setChapter(1);
    }
  }, [books, book]);

  useEffect(() => {
    if (!translationId || book === null) return;
    void api()
      .invoke('bible.chapter', { translationId, book, chapter })
      .then((v) => {
        setVerses(v);
        setRange(pendingRange.current);
        pendingRange.current = null;
      });
  }, [translationId, book, chapter]);

  const currentBook = books?.find((b) => b.number === book);
  const selectionRef = useMemo(() => {
    if (!currentBook) return '';
    if (!range) return `${currentBook.name} ${chapter}`;
    return range.start === range.end ? `${currentBook.name} ${chapter}:${range.start}` : `${currentBook.name} ${chapter}:${range.start}-${range.end}`;
  }, [currentBook, chapter, range]);

  const goToReference = async () => {
    if (!reference.trim() || !translationId) return;
    const result = await api().invoke('bible.lookup', { translationId, reference });
    if (result.error || result.verses.length === 0) {
      setRefError(result.error ?? 'Not found');
      return;
    }
    setRefError(null);
    const first = result.verses[0]!;
    const last = result.verses[result.verses.length - 1]!;
    const hasVerses = /\d\s*[:.]\s*\d|\d\s+\d/.test(reference);
    jumpTo(first.book, first.chapter, hasVerses ? { start: first.verse, end: last.chapter === first.chapter ? last.verse : first.verse } : null);
  };

  const runSearch = async () => {
    if (!translationId || search.trim().length < 3) {
      setResults([]);
      return;
    }
    setResults(await call('bible.search', { translationId, text: search, limit: 200 }));
  };

  const addToService = async (ref: string, show: boolean) => {
    if (!deck.serviceId) {
      toast('warn', 'Open or create a service first (Live tab).');
      return;
    }
    const service = await call('services.get', { id: deck.serviceId });
    if (!service) return;
    const item = bibleItem(translationId, ref, versesPerSlide);
    const index = service.items.findIndex((i) => i.id === selectedItemId);
    const items = service.items.slice();
    items.splice(index >= 0 ? index + 1 : items.length, 0, item);
    await call('services.save', { ...service, items });
    if (show) {
      await sendLive({ type: 'go', itemId: item.id, slideIndex: 0 });
      toast('success', `${ref} is on screen`);
    } else toast('success', `${ref} added to “${service.name}”`);
  };

  const removeTranslation = async (t: BibleTranslation) => {
    const ok = await confirm({ title: 'Remove translation', message: `Remove “${t.name}” from this computer? Services using it will show a warning.`, confirmLabel: 'Remove', danger: true });
    if (ok) await call('bible.deleteTranslation', { id: t.id });
  };

  if (translations && translations.length === 0) {
    return (
      <div className="page">
        <Empty icon="bible" title="No Bible installed">
          Import a Bible translation you are allowed to use (Zefania XML, OSIS, JSON or CSV).
          <div className="row-gap center">
            <button className="btn btn-primary" onClick={() => setImporting(true)}>
              <Icon name="import" /> Import a Bible…
            </button>
          </div>
        </Empty>
        {importing && <ImportBibleDialog onClose={() => setImporting(false)} />}
      </div>
    );
  }

  const translation = translations?.find((t) => t.id === translationId);
  return (
    <div className="bible-layout">
      <aside className="panel bible-nav">
        <header className="panel-header column">
          <div className="row-gap">
            <select value={translationId} onChange={(e) => setTranslationId(e.target.value)} aria-label="Translation" className="grow">
              {(translations ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.abbreviation} — {t.name}
                </option>
              ))}
            </select>
            <button className="btn btn-small" onClick={() => setImporting(true)} title="Import a translation">
              <Icon name="import" />
            </button>
            {translation && (
              <button className="btn btn-small btn-ghost-danger" onClick={() => void removeTranslation(translation)} title="Remove this translation">
                <Icon name="trash" />
              </button>
            )}
          </div>
          {translation && (
            <span className="muted small">
              {translation.verseCount.toLocaleString()} verses{translation.license ? ` · ${translation.license}` : ''}
            </span>
          )}
          <div className="search-box">
            <Icon name="bible" />
            <input placeholder="Go to reference (John 3:16, Ps 23)" value={reference} onChange={(e) => setReference(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void goToReference()} data-testid="bible-ref" />
          </div>
          {refError && <span className="error-text">{refError}</span>}
        </header>
        <div className="book-list">
          {(books ?? []).map((b) => (
            <button key={b.number} className={`book ${b.number === book ? 'selected' : ''}`} onClick={() => jumpTo(b.number, 1, null)}>
              {b.name}
            </button>
          ))}
        </div>
      </aside>

      <section className="panel bible-main">
        <header className="panel-header">
          <div className="row-gap">
            <strong>{currentBook?.name}</strong>
            <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} aria-label="Chapter">
              {Array.from({ length: currentBook?.chapters ?? 1 }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  Chapter {c}
                </option>
              ))}
            </select>
            <button className="btn-icon" disabled={chapter <= 1} onClick={() => setChapter((c) => c - 1)} title="Previous chapter">
              <Icon name="prev" />
            </button>
            <button className="btn-icon" disabled={chapter >= (currentBook?.chapters ?? 1)} onClick={() => setChapter((c) => c + 1)} title="Next chapter">
              <Icon name="next" />
            </button>
          </div>
          <div className="row-gap">
            <select value={versesPerSlide} onChange={(e) => setVersesPerSlide(Number(e.target.value))} aria-label="Verses per slide" title="Verses per slide">
              <option value={0}>Auto per slide</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} verse{n > 1 ? 's' : ''}/slide
                </option>
              ))}
            </select>
            <button className="btn btn-small" disabled={!selectionRef} onClick={() => void call('bible.saveFavorite', { translationId, reference: selectionRef })} title="Save as favorite">
              <Icon name="star" />
            </button>
            <button className="btn btn-small" disabled={!selectionRef} onClick={() => void addToService(selectionRef, false)}>
              <Icon name="plus" /> Add to service
            </button>
            <button className="btn btn-small btn-live" disabled={!selectionRef} onClick={() => void addToService(selectionRef, true)} data-testid="bible-show">
              Show now
            </button>
          </div>
        </header>
        <div className="selection-bar">
          <strong>{selectionRef}</strong>
          <span className="muted"> — click a verse, Shift+click to select a range{range ? '' : ' (whole chapter selected)'}</span>
          {range && (
            <button className="btn-link" onClick={() => setRange(null)}>
              Clear selection
            </button>
          )}
        </div>
        <div className="verses">
          {verses.map((v) => {
            const inRange = range && v.verse >= range.start && v.verse <= range.end;
            return (
              <p
                key={v.verse}
                className={`verse ${inRange ? 'selected' : ''}`}
                onClick={(e) => {
                  if (e.shiftKey && range) setRange({ start: Math.min(range.start, v.verse), end: Math.max(range.end, v.verse) });
                  else setRange({ start: v.verse, end: v.verse });
                }}
              >
                <sup>{v.verse}</sup> {v.text}
              </p>
            );
          })}
          {verses.length === 0 && <Empty icon="bible" title="This chapter is not in the installed text" />}
        </div>
        {!deck.serviceId && (
          <div className="banner banner-note">
            No service is open. <button className="btn-link" onClick={() => setView('live')}>Open or create one</button> to project passages.
          </div>
        )}
      </section>

      <aside className="panel bible-side">
        <section>
          <h3>Search the text</h3>
          <div className="search-box">
            <Icon name="search" />
            <input placeholder="Words (3+ letters)" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void runSearch()} />
          </div>
          <div className="search-results">
            {results.map((r) => (
              <button key={`${r.book}-${r.chapter}-${r.verse}`} className="result" onClick={() => jumpTo(r.book, r.chapter, { start: r.verse, end: r.verse })}>
                <strong>{r.reference}</strong> <span className="muted">{r.text}</span>
              </button>
            ))}
            {search.trim().length >= 3 && results.length === 0 && <span className="muted small">Press Enter to search.</span>}
          </div>
        </section>
        <section>
          <h3>Favorites</h3>
          {(favorites ?? []).filter((f) => f.translationId === translationId).length === 0 && <span className="muted small">Use ☆ to save passages you use often.</span>}
          {(favorites ?? [])
            .filter((f) => f.translationId === translationId)
            .map((f) => (
              <div key={f.id} className="fav-row">
                <button className="btn-link" onClick={() => setReference(f.reference)}>
                  {f.reference}
                </button>
                <button className="btn-icon" title="Add to service" onClick={() => void addToService(f.reference, false)}>
                  <Icon name="plus" size={14} />
                </button>
                <button className="btn-icon" title="Remove favorite" onClick={() => void call('bible.deleteFavorite', { id: f.id })}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
        </section>
      </aside>
      {importing && <ImportBibleDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function ImportBibleDialog({ onClose }: { onClose: () => void }) {
  const { call, toast } = useStore();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [language, setLanguage] = useState('');
  const [license, setLicense] = useState('Public domain');
  const [busy, setBusy] = useState(false);
  const choose = async () => {
    const files = await call('dialog.openFiles', { title: 'Choose a Bible file', filters: [{ name: 'Bible (Zefania XML, OSIS, JSON, CSV)', extensions: BIBLE_EXTS }] });
    if (files[0]) setPath(files[0]);
  };
  const run = async () => {
    setBusy(true);
    try {
      const t = await call('bible.import', { path, name, abbreviation, language, license });
      toast('success', `${t.name} imported (${t.verseCount.toLocaleString()} verses)`);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Import a Bible translation"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!path || busy} onClick={() => void run()}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <p className="hint">
        Only import translations your church may use: public-domain texts (e.g. King James Version, Louis Segond 1910, World English Bible) or texts you have permission for.
        Supported files: Zefania XML, OSIS XML, JSON, CSV/TSV (book, chapter, verse, text).
      </p>
      <div className="form-grid">
        <Field label="File" wide>
          <div className="row-gap">
            <input value={path} readOnly placeholder="No file chosen" className="grow" />
            <button className="btn" onClick={() => void choose()}>
              Choose…
            </button>
          </div>
        </Field>
        <Field label="Name" hint="Leave empty to use the name in the file.">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Louis Segond 1910" />
        </Field>
        <Field label="Abbreviation">
          <input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} placeholder="LSG" />
        </Field>
        <Field label="Language">
          <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="fr" />
        </Field>
        <Field label="License / permission">
          <input value={license} onChange={(e) => setLicense(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
