/** Song library: search, categories, editor with live slide preview, import/export. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Song, SongbookSummary, SongSummary } from '../../../../shared/types';
import { mergeSectionIds, parseLyrics, parseOrder, serializeLyrics } from '../../../../shared/lyrics';
import { songSlides } from '../../../../shared/slides';
import { fallbackTheme } from '../../../../shared/themes';
import { newId, nowIso } from '../../../../shared/util';
import { api, useData, useStore } from '../../store';
import { Empty, Field, Icon, Modal, useConfirm } from '../../components/ui';
import { SlideView } from '../../../common/SlideView';
import { ThemeSelect } from '../live/ItemEditor';
import { SONG_EXTS } from '../../fileTypes';
import { songItem } from '../../itemFactory';

const DEFAULT_CATEGORIES = ['Worship', 'Praise', 'Communion', 'Prayer', 'Hymn', 'Christmas', 'Easter', 'Closing'];

interface Draft {
  song: Song;
  lyrics: string;
  categories: string;
  arrangements: Array<{ id: string; name: string; order: string }>;
}

function toDraft(song: Song): Draft {
  return {
    song,
    lyrics: serializeLyrics(song.sections),
    categories: song.categories.join(', '),
    arrangements: song.arrangements.map((a) => ({ id: a.id, name: a.name, order: a.order.join(' ') })),
  };
}

function fromDraft(draft: Draft): Song {
  const sections = mergeSectionIds(draft.song.sections, parseLyrics(draft.lyrics));
  return {
    ...draft.song,
    sections,
    categories: draft.categories
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    arrangements: draft.arrangements.map((a) => ({ id: a.id, name: a.name.trim() || 'Arrangement', order: parseOrder(a.order) })),
  };
}

function blankSong(): Song {
  return {
    id: '',
    title: '',
    author: '',
    copyright: '',
    ccli: '',
    key: '',
    notes: '',
    categories: [],
    songbook: '',
    songbookNumber: '',
    sections: [],
    arrangements: [],
    defaultArrangementId: null,
    themeId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function SongsView() {
  const { call, toast, deck, searchRequest } = useStore();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [songbook, setSongbook] = useState('');
  const [songs] = useData<SongSummary[]>(['songs'], () => api().invoke('songs.list', { query, category, songbook }), [query, category, songbook]);
  const [songbooks] = useData<SongbookSummary[]>(['songs'], () => api().invoke('songs.songbooks', undefined));
  const [renaming, setRenaming] = useState(false);
  useEffect(() => {
    if (songbook && songbooks && !songbooks.some((b) => b.name === songbook)) setSongbook('');
  }, [songbooks, songbook]);
  const [categories] = useData<string[]>(['songs'], () => api().invoke('songs.categories', undefined));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pasting, setPasting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstSearch = useRef(searchRequest);

  useEffect(() => {
    if (searchRequest !== firstSearch.current) searchRef.current?.focus();
  }, [searchRequest]);

  const guard = async () => {
    if (!dirty) return true;
    return confirm({ title: 'Unsaved changes', message: 'Discard the changes to this song?', confirmLabel: 'Discard', danger: true });
  };

  const select = async (id: string) => {
    if (id === selectedId || !(await guard())) return;
    const song = await call('songs.get', { id });
    if (!song) return;
    setSelectedId(id);
    setDraft(toDraft(song));
    setDirty(false);
  };

  const createNew = async () => {
    if (!(await guard())) return;
    setSelectedId(null);
    setDraft(toDraft(blankSong()));
    setDirty(false);
  };

  const save = async () => {
    if (!draft) return;
    const saved = await call('songs.save', fromDraft(draft)).catch(() => null);
    if (!saved) return;
    setSelectedId(saved.id);
    setDraft(toDraft(saved));
    setDirty(false);
    toast('success', `“${saved.title}” saved`);
  };

  const remove = async () => {
    if (!draft?.song.id) return;
    const usage = await call('songs.usage', { id: draft.song.id });
    const ok = await confirm({
      title: 'Delete song',
      message: (
        <>
          Delete “{draft.song.title}” from the library?
          {usage.length > 0 && (
            <p className="warn-text">
              It is used in: {usage.join(', ')}. Those items will show a warning until replaced.
            </p>
          )}
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await call('songs.delete', { id: draft.song.id });
    setDraft(null);
    setSelectedId(null);
    setDirty(false);
  };

  const duplicate = async () => {
    if (!draft?.song.id || !(await guard())) return;
    const copy = await call('songs.duplicate', { id: draft.song.id });
    setSelectedId(copy.id);
    setDraft(toDraft(copy));
    setDirty(false);
  };

  const importFiles = async () => {
    const paths = await call('dialog.openFiles', {
      title: 'Import songs',
      filters: [
        { name: 'Songs (VideoPsalm songbooks, FountainVideo JSON, OpenLyrics, text, ChordPro)', extensions: SONG_EXTS },
        { name: 'VideoPsalm songbooks (.json, .vpc)', extensions: ['json', 'vpc'] },
      ],
      multiple: true,
    });
    if (paths.length === 0) return;
    toast('info', `Importing ${paths.length} file${paths.length === 1 ? '' : 's'}…`);
    const report = await call('songs.importFiles', { paths });
    const parts = [`${report.imported} song${report.imported === 1 ? '' : 's'} imported`];
    if (report.updated) parts.push(`${report.updated} updated`);
    if (report.skipped) parts.push(`${report.skipped} skipped`);
    toast(report.imported || report.updated ? 'success' : 'warn', parts.join(', '));
    report.errors.slice(0, 5).forEach((e) => toast('warn', e));
    if (report.errors.length > 5) toast('warn', `…and ${report.errors.length - 5} more (see the log file)`);
  };

  const addToService = async () => {
    if (!draft?.song.id || !deck.serviceId) return;
    const service = await call('services.get', { id: deck.serviceId });
    if (!service) return;
    await call('services.save', { ...service, items: [...service.items, songItem(draft.song)] });
    toast('success', `Added to “${service.name}”`);
  };

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const updateSong = (patch: Partial<Song>) => {
    setDraft((d) => (d ? { ...d, song: { ...d.song, ...patch } } : d));
    setDirty(true);
  };

  const removeSongbook = async () => {
    const book = songbooks?.find((b) => b.name === songbook);
    if (!book) return;
    const ok = await confirm({
      title: 'Delete songbook',
      message: (
        <>
          Delete the songbook “{book.name}” and its {book.count} song{book.count === 1 ? '' : 's'}?
          <p className="hint">Services that use these songs will show a warning. A backup is made every day; you can also back up now in Settings.</p>
        </>
      ),
      confirmLabel: 'Delete songbook',
      danger: true,
    });
    if (!ok) return;
    const { count } = await call('songs.deleteSongbook', { name: book.name });
    toast('success', `${count} song${count === 1 ? '' : 's'} deleted`);
    setSongbook('');
    if (draft?.song.songbook === book.name) {
      setDraft(null);
      setSelectedId(null);
      setDirty(false);
    }
  };

  const allCategories = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...(categories ?? [])])], [categories]);

  return (
    <div className="split-layout">
      <aside className="panel list-panel">
        <header className="panel-header column">
          <div className="row-gap">
            <button className="btn btn-primary btn-small" onClick={() => void createNew()}>
              <Icon name="plus" /> New song
            </button>
            <button className="btn btn-small" onClick={() => void importFiles()}>
              <Icon name="import" /> Import…
            </button>
            <button className="btn btn-small" onClick={() => setPasting(true)} title="Paste lyrics from a web page or document">
              Paste
            </button>
            <button className="btn btn-small" onClick={() => setExporting(true)}>
              <Icon name="export" /> Export…
            </button>
          </div>
          <div className="search-box">
            <Icon name="search" />
            <input ref={searchRef} placeholder="Search title, words, author, number…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="song-search" />
          </div>
          <div className="row-gap">
            <select className="grow" value={songbook} onChange={(e) => setSongbook(e.target.value)} aria-label="Songbook" data-testid="songbook-filter">
              <option value="">All songbooks</option>
              {(songbooks ?? []).map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.count})
                </option>
              ))}
            </select>
            {songbook && (
              <>
                <button className="btn-icon" title="Rename this songbook" onClick={() => setRenaming(true)}>
                  <Icon name="edit" />
                </button>
                <button className="btn-icon" title="Delete this songbook and its songs" onClick={() => void removeSongbook()}>
                  <Icon name="trash" />
                </button>
              </>
            )}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </header>
        <div className="scroll-list">
          {songs && songs.length === 0 && <Empty icon="songs" title={query || category ? 'No match' : 'No songs yet'} />}
          {songs?.map((s) => (
            <button key={s.id} className={`list-item ${s.id === selectedId ? 'selected' : ''}`} onClick={() => void select(s.id)}>
              <strong>
                {s.songbookNumber && <span className="song-number">{songbook ? s.songbookNumber : `${s.songbook} ${s.songbookNumber}`}</span>}
                {s.title}
              </strong>
              <span className="muted">{s.firstLine}</span>
            </button>
          ))}
        </div>
        <footer className="panel-footer muted">{songs ? `${songs.length} song${songs.length === 1 ? '' : 's'}` : ''}</footer>
      </aside>

      {draft ? (
        <SongEditor
          draft={draft}
          dirty={dirty}
          categories={allCategories}
          songbooks={(songbooks ?? []).map((b) => b.name)}
          update={update}
          updateSong={updateSong}
          onSave={() => void save()}
          onDelete={() => void remove()}
          onDuplicate={() => void duplicate()}
          onAddToService={deck.serviceId && draft.song.id ? () => void addToService() : undefined}
        />
      ) : (
        <section className="panel editor-panel">
          <Empty icon="songs" title="Select a song or create a new one">
            Lyrics use simple headers like <code>[Verse 1]</code>, <code>[Chorus]</code>, <code>[Bridge]</code>. A blank line starts a new slide.
          </Empty>
        </section>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} selectedId={draft?.song.id || null} songbook={songbook} songbookIds={songbook ? (songs ?? []).map((s) => s.id) : []} />}
      {renaming && songbook && (
        <RenameSongbookDialog
          name={songbook}
          onClose={() => setRenaming(false)}
          onRenamed={(to) => {
            setSongbook(to);
            setRenaming(false);
          }}
        />
      )}
      {pasting && <PasteDialog onClose={() => setPasting(false)} onImported={(id) => void select(id)} />}
    </div>
  );
}

function SongEditor({
  draft,
  dirty,
  categories,
  songbooks,
  update,
  updateSong,
  onSave,
  onDelete,
  onDuplicate,
  onAddToService,
}: {
  draft: Draft;
  dirty: boolean;
  categories: string[];
  songbooks: string[];
  update: (patch: Partial<Draft>) => void;
  updateSong: (patch: Partial<Song>) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddToService?: () => void;
}) {
  const { themes, settings, mediaUrl } = useStore();
  const song = draft.song;
  const preview = useMemo(() => {
    try {
      const s = fromDraft(draft);
      const theme = themes.find((t) => t.id === (s.themeId ?? settings?.defaultThemeId)) ?? fallbackTheme();
      const firstArrangement = s.arrangements.find((a) => a.id === s.defaultArrangementId)?.id ?? null;
      return songSlides(s, firstArrangement, theme, settings?.maxLinesPerSlide ?? 4);
    } catch {
      return [];
    }
  }, [draft, themes, settings]);
  const labels = useMemo(() => parseLyrics(draft.lyrics).map((s) => s.label), [draft.lyrics]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);

  return (
    <section className="panel editor-panel">
      <header className="panel-header">
        <h2 className="editor-title">{song.title || 'New song'}{dirty && <span className="dirty-dot" title="Unsaved changes" />}</h2>
        <div className="row-gap">
          {onAddToService && (
            <button className="btn btn-small" onClick={onAddToService}>
              <Icon name="plus" /> Add to open service
            </button>
          )}
          {song.id && (
            <>
              <button className="btn btn-small" onClick={onDuplicate}>
                <Icon name="copy" /> Duplicate
              </button>
              <button className="btn btn-small btn-ghost-danger" onClick={onDelete}>
                <Icon name="trash" /> Delete
              </button>
            </>
          )}
          <button className="btn btn-primary btn-small" onClick={onSave} disabled={!dirty && Boolean(song.id)} data-testid="song-save">
            Save <kbd>Ctrl+S</kbd>
          </button>
        </div>
      </header>
      <div className="editor-scroll">
        <div className="song-editor">
          <div className="form-grid">
            <Field label="Title" wide>
              <input value={song.title} onChange={(e) => updateSong({ title: e.target.value })} autoFocus={!song.id} data-testid="song-title" />
            </Field>
            <Field label="Author(s)">
              <input value={song.author} onChange={(e) => updateSong({ author: e.target.value })} />
            </Field>
            <Field label="Copyright">
              <input value={song.copyright} onChange={(e) => updateSong({ copyright: e.target.value })} />
            </Field>
            <Field label="CCLI song number">
              <input value={song.ccli} onChange={(e) => updateSong({ ccli: e.target.value })} />
            </Field>
            <Field label="Songbook (recueil)" hint="Songs with the same songbook are grouped, like a hymnal.">
              <input list="songbook-names" value={song.songbook} onChange={(e) => updateSong({ songbook: e.target.value })} data-testid="song-songbook" />
              <datalist id="songbook-names">
                {songbooks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Number in the songbook">
              <input value={song.songbookNumber} onChange={(e) => updateSong({ songbookNumber: e.target.value })} data-testid="song-number" />
            </Field>
            <Field label="Key">
              <input value={song.key} onChange={(e) => updateSong({ key: e.target.value })} />
            </Field>
            <Field label="Categories" wide hint="Separate with commas.">
              <input list="song-categories" value={draft.categories} onChange={(e) => update({ categories: e.target.value })} />
              <datalist id="song-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="chip-row field-wide">
              {categories.map((c) => {
                const active = draft.categories.split(',').map((x) => x.trim().toLowerCase()).includes(c.toLowerCase());
                return (
                  <button
                    key={c}
                    className={`chip ${active ? 'active' : ''}`}
                    onClick={() => {
                      const list = draft.categories.split(',').map((x) => x.trim()).filter(Boolean);
                      update({ categories: (active ? list.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...list, c]).join(', ') });
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <Field
              label="Lyrics"
              wide
              hint={
                <>
                  Headers: <code>[Verse 1]</code> <code>[Chorus]</code> <code>[Bridge]</code> <code>[Pre-Chorus]</code> <code>[Tag]</code> (or Couplet/Refrain/Pont). A blank line = new slide.
                  {labels.length > 0 && <> Sections found: <strong>{labels.join(' ')}</strong></>}
                </>
              }
            >
              <textarea className="lyrics" rows={18} value={draft.lyrics} onChange={(e) => update({ lyrics: e.target.value })} spellCheck={false} data-testid="song-lyrics" />
            </Field>

            <div className="field-wide">
              <span className="field-label">Arrangements (order of sections)</span>
              <p className="hint">e.g. <code>V1 C V2 C B C</code>. The default arrangement is used when the song is added to a service.</p>
              {draft.arrangements.map((a, i) => (
                <div key={a.id} className="arrangement-row">
                  <label className="check" title="Default arrangement">
                    <input type="radio" name="default-arrangement" checked={song.defaultArrangementId === a.id} onChange={() => updateSong({ defaultArrangementId: a.id })} />
                  </label>
                  <input className="arr-name" value={a.name} onChange={(e) => update({ arrangements: draft.arrangements.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input className="arr-order" value={a.order} placeholder="V1 C V2 C" onChange={(e) => update({ arrangements: draft.arrangements.map((x, j) => (j === i ? { ...x, order: e.target.value } : x)) })} />
                  <button
                    className="btn-icon"
                    title="Delete arrangement"
                    onClick={() => {
                      update({ arrangements: draft.arrangements.filter((_, j) => j !== i) });
                      if (song.defaultArrangementId === a.id) updateSong({ defaultArrangementId: null });
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
              <div className="row-gap">
                <button className="btn btn-small" onClick={() => update({ arrangements: [...draft.arrangements, { id: newId(), name: draft.arrangements.length ? `Arrangement ${draft.arrangements.length + 1}` : 'Default', order: labels.join(' ') }] })}>
                  <Icon name="plus" /> Add arrangement
                </button>
                {song.defaultArrangementId && (
                  <button className="btn btn-small" onClick={() => updateSong({ defaultArrangementId: null })}>
                    Use plain section order by default
                  </button>
                )}
              </div>
            </div>
            <Field label="Theme for this song">
              <ThemeSelect value={song.themeId} onChange={(themeId) => updateSong({ themeId })} />
            </Field>
            <Field label="Notes (not projected)" wide>
              <textarea rows={2} value={song.notes} onChange={(e) => updateSong({ notes: e.target.value })} />
            </Field>
          </div>
          <div className="song-preview">
            <span className="field-label">Slides preview ({preview.length})</span>
            <div className="preview-grid">
              {preview.map((slide, i) => (
                <div key={i} className="thumb static">
                  <SlideView role="thumb" slide={slide} mediaUrl={mediaUrl} />
                  <span className="thumb-label">
                    <span className="thumb-num">{i + 1}</span>
                    {slide.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExportDialog({ onClose, selectedId, songbook, songbookIds }: { onClose: () => void; selectedId: string | null; songbook: string; songbookIds: string[] }) {
  const { call, toast } = useStore();
  const [format, setFormat] = useState<'json' | 'openlyrics' | 'text' | 'videopsalm'>('json');
  const [scope, setScope] = useState<'all' | 'selected' | 'songbook'>(songbook ? 'songbook' : 'all');
  const run = async () => {
    const isFile = format === 'json' || format === 'videopsalm';
    const base = scope === 'songbook' && songbook ? songbook : 'FountainVideo songs';
    const target = await call('dialog.saveFile', {
      title: isFile ? 'Export songs' : 'Choose a name for the export folder',
      defaultName: isFile ? `${base}${format === 'videopsalm' ? ' (VideoPsalm)' : ''}.json` : format === 'openlyrics' ? `${base} (OpenLyrics)` : `${base} (text)`,
      filters: isFile ? [{ name: format === 'videopsalm' ? 'VideoPsalm songbook' : 'FountainVideo songs', extensions: ['json'] }] : [{ name: 'Folder', extensions: ['*'] }],
    });
    if (!target) return;
    const ids = scope === 'selected' && selectedId ? [selectedId] : scope === 'songbook' ? songbookIds : null;
    const result = await call('songs.export', { ids, path: target, format, songbookName: scope === 'songbook' ? songbook : undefined });
    toast('success', `${result.count} song${result.count === 1 ? '' : 's'} exported to ${result.path}`);
    onClose();
  };
  return (
    <Modal
      title="Export songs"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void run()}>
            Export…
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Format" wide>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="json">FountainVideo JSON — one file, everything kept (recommended)</option>
            <option value="openlyrics">OpenLyrics XML — one file per song (OpenLP and others)</option>
            <option value="text">Plain text — one file per song</option>
            <option value="videopsalm">VideoPsalm songbook — one file to open in VideoPsalm</option>
          </select>
        </Field>
        <Field label="Songs" wide>
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">All songs</option>
            {songbook && <option value="songbook">The songbook “{songbook}” ({songbookIds.length} songs)</option>}
            <option value="selected" disabled={!selectedId}>
              Only the selected song
            </option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function PasteDialog({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const { call, toast } = useStore();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const run = async () => {
    const report = await call('songs.importText', { text: title ? `Title: ${title}\n${text}` : text, title: title || undefined });
    if (report.errors.length) report.errors.forEach((e) => toast('error', e));
    if (report.ids[0]) {
      toast('success', 'Song created');
      onImported(report.ids[0]);
      onClose();
    }
  };
  return (
    <Modal
      title="Paste lyrics"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void run()}>
            Create song
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" wide hint="If empty, the first line of the text is used when it is followed by a blank line.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Lyrics" wide hint="Paragraphs become verses; [Chorus]-style headers are recognised.">
          <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RenameSongbookDialog({ name, onClose, onRenamed }: { name: string; onClose: () => void; onRenamed: (to: string) => void }) {
  const { call, toast } = useStore();
  const [value, setValue] = useState(name);
  const run = async () => {
    const to = value.trim();
    if (!to || to === name) return onClose();
    const { count } = await call('songs.renameSongbook', { from: name, to });
    toast('success', `Songbook renamed (${count} song${count === 1 ? '' : 's'})`);
    onRenamed(to);
  };
  return (
    <Modal
      title="Rename songbook"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void run()}>
            Rename
          </button>
        </>
      }
    >
      <Field label="Songbook name">
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
      </Field>
    </Modal>
  );
}
