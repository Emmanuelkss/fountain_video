/** Edits one service item (arrangement, reference, announcement text, media options, theme). */
import { useEffect, useState } from 'react';
import type { AnnouncementSlide, BibleTranslation, MediaItem, ServiceItem, Song } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Field, Icon, Modal } from '../../components/ui';
import { SlideView } from '../../../common/SlideView';

export function ThemeSelect({ value, onChange, inheritLabel = 'Default theme' }: { value: string | null; onChange: (id: string | null) => void; inheritLabel?: string }) {
  const { themes } = useStore();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{inheritLabel}</option>
      {themes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function AnnouncementSlidesEditor({ slides, onChange }: { slides: AnnouncementSlide[]; onChange: (slides: AnnouncementSlide[]) => void }) {
  const [media] = useData<MediaItem[]>(['media'], () => api().invoke('media.list', undefined));
  const images = (media ?? []).filter((m) => m.kind === 'image');
  const set = (index: number, patch: Partial<AnnouncementSlide>) => onChange(slides.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <div className="ann-slides">
      {slides.map((slide, index) => (
        <div key={index} className="ann-slide">
          <div className="ann-slide-head">
            <strong>Slide {index + 1}</strong>
            <div className="row-gap">
              <button className="btn-icon" title="Move up" disabled={index === 0} onClick={() => {
                const copy = slides.slice();
                [copy[index - 1], copy[index]] = [copy[index]!, copy[index - 1]!];
                onChange(copy);
              }}>
                <Icon name="up" />
              </button>
              <button className="btn-icon" title="Move down" disabled={index === slides.length - 1} onClick={() => {
                const copy = slides.slice();
                [copy[index + 1], copy[index]] = [copy[index]!, copy[index + 1]!];
                onChange(copy);
              }}>
                <Icon name="down" />
              </button>
              <button className="btn-icon" title="Delete slide" disabled={slides.length === 1} onClick={() => onChange(slides.filter((_, i) => i !== index))}>
                <Icon name="trash" />
              </button>
            </div>
          </div>
          <Field label="Title">
            <input value={slide.title} onChange={(e) => set(index, { title: e.target.value })} />
          </Field>
          <Field label="Text" hint="Each line is shown on its own line.">
            <textarea rows={4} value={slide.body} onChange={(e) => set(index, { body: e.target.value })} />
          </Field>
          <Field label="Background picture">
            <select value={slide.imagePath ?? ''} onChange={(e) => set(index, { imagePath: e.target.value || null })}>
              <option value="">None (theme background)</option>
              {images.map((m) => (
                <option key={m.id} value={m.path}>
                  {m.name}
                </option>
              ))}
              {slide.imagePath && !images.some((m) => m.path === slide.imagePath) && <option value={slide.imagePath}>{slide.imagePath}</option>}
            </select>
          </Field>
        </div>
      ))}
      <button className="btn" onClick={() => onChange([...slides, { title: '', body: '', imagePath: null }])}>
        <Icon name="plus" /> Add slide
      </button>
    </div>
  );
}

export function ItemEditor({ item, onSave, onClose }: { item: ServiceItem; onSave: (item: ServiceItem) => void; onClose: () => void }) {
  const { deck, mediaUrl, setView } = useStore();
  const [draft, setDraft] = useState<ServiceItem>(structuredClone(item));
  const [song, setSong] = useState<Song | null>(null);
  const [translations] = useData<BibleTranslation[]>(['bible'], () => api().invoke('bible.translations', undefined));
  const [lookup, setLookup] = useState<string | null>(null);

  useEffect(() => {
    if (item.type === 'song') void api().invoke('songs.get', { id: item.songId }).then(setSong);
  }, [item]);

  useEffect(() => {
    if (draft.type !== 'bible' || !draft.translationId) return undefined;
    const handle = window.setTimeout(() => {
      void api()
        .invoke('bible.lookup', { translationId: draft.translationId, reference: draft.reference })
        .then((r) => setLookup(r.error ?? `${r.reference} · ${r.verses.length} verse${r.verses.length === 1 ? '' : 's'}`));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [draft]);

  const patch = (p: Partial<ServiceItem>) => setDraft((d) => ({ ...d, ...p }) as ServiceItem);
  const preview = deck.items.find((d) => d.itemId === item.id)?.slides[0] ?? null;

  return (
    <Modal
      title={`Edit ${item.type === 'header' ? 'group' : item.type}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </>
      }
    >
      <div className="editor-split">
        <div className="form-grid">
          <Field label={item.type === 'header' ? 'Group name' : 'Title in the service order'} wide>
            <input autoFocus value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>

          {draft.type === 'song' && (
            <>
              <Field label="Arrangement" wide hint={song ? `Sections: ${song.sections.map((s) => s.label).join(' ')}` : 'This song is no longer in the library.'}>
                <select value={draft.arrangementId ?? ''} onChange={(e) => patch({ arrangementId: e.target.value || null })}>
                  <option value="">
                    {song?.defaultArrangementId ? `Song default (${song.arrangements.find((a) => a.id === song.defaultArrangementId)?.name})` : 'All sections in order'}
                  </option>
                  {song?.arrangements.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}: {a.order.join(' ')}
                    </option>
                  ))}
                </select>
              </Field>
              {song && (
                <div className="field-wide">
                  <button className="btn btn-small" onClick={() => setView('songs')}>
                    <Icon name="edit" /> Edit lyrics &amp; arrangements in the Songs tab
                  </button>
                </div>
              )}
            </>
          )}

          {draft.type === 'bible' && (
            <>
              <Field label="Translation">
                <select value={draft.translationId} onChange={(e) => patch({ translationId: e.target.value })}>
                  {(translations ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.abbreviation} — {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Verses per slide">
                <select value={draft.versesPerSlide} onChange={(e) => patch({ versesPerSlide: Number(e.target.value) })}>
                  <option value={0}>Automatic</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reference" wide hint={lookup ?? ' '}>
                <input value={draft.reference} onChange={(e) => patch({ reference: e.target.value })} />
              </Field>
              <label className="check field-wide">
                <input type="checkbox" checked={draft.showVerseNumbers} onChange={(e) => patch({ showVerseNumbers: e.target.checked })} /> Show verse numbers
              </label>
            </>
          )}

          {draft.type === 'announcement' && (
            <div className="field-wide">
              <AnnouncementSlidesEditor slides={draft.slides} onChange={(slides) => patch({ slides })} />
            </div>
          )}

          {(draft.type === 'image' || draft.type === 'video') && (
            <Field label="File" wide>
              <input value={draft.path} readOnly />
            </Field>
          )}
          {draft.type === 'video' && (
            <div className="field-wide row-gap">
              <label className="check">
                <input type="checkbox" checked={draft.loop} onChange={(e) => patch({ loop: e.target.checked })} /> Loop
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.muted} onChange={(e) => patch({ muted: e.target.checked })} /> Mute sound
              </label>
            </div>
          )}

          {draft.type !== 'header' && draft.type !== 'image' && draft.type !== 'video' && (
            <Field label="Theme">
              <ThemeSelect value={draft.themeId} onChange={(themeId) => patch({ themeId })} inheritLabel={draft.type === 'song' ? 'Song / default theme' : 'Default theme'} />
            </Field>
          )}
          {draft.type !== 'header' && (
            <Field label="Operator notes (not projected)" wide>
              <textarea rows={2} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </Field>
          )}
        </div>
        {preview && (
          <div className="editor-preview">
            <span className="field-label">Current first slide</span>
            <div className="monitor-frame">
              <SlideView role="monitor" slide={preview} mediaUrl={mediaUrl} />
            </div>
            <span className="hint">The preview refreshes after saving.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
