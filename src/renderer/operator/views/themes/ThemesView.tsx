/** Theme (slide design) editor with live preview at projector proportions. */
import { useEffect, useMemo, useState } from 'react';
import type { MediaItem, Slide, Theme } from '../../../../shared/types';
import { makeTheme } from '../../../../shared/themes';
import { api, useData, useStore } from '../../store';
import { Field, Icon, useConfirm } from '../../components/ui';
import { SlideView } from '../../../common/SlideView';

const FONTS = [
  { label: 'Segoe UI (modern)', value: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Carlito, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana (very legible)', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Georgia (elegant serif)', value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", Georgia, serif' },
  { label: 'Impact (bold titles)', value: 'Impact, "Arial Black", sans-serif' },
];

function sample(theme: Theme, kind: 'song' | 'bible' | 'title'): Slide {
  const base = { group: 0, mediaPath: null, missing: false, loop: false, muted: false, theme };
  if (kind === 'bible') {
    return { ...base, kind: 'text', label: '3:16', title: '', text: '⁣16⁣ For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', footer: 'John 3:16 (KJV)' };
  }
  if (kind === 'title') return { ...base, kind: 'title', label: 'Title', title: 'Welcome', text: 'We are glad you are here', footer: '' };
  return { ...base, kind: 'text', label: 'V1', title: '', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.', footer: 'Amazing Grace · John Newton (1779)' };
}

export function ThemesView() {
  const { themes, settings, call, toast, mediaUrl } = useStore();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string>(settings?.defaultThemeId ?? themes[0]?.id ?? '');
  const [draft, setDraft] = useState<Theme | null>(null);
  const [media] = useData<MediaItem[]>(['media'], () => api().invoke('media.list', undefined));

  const selected = themes.find((t) => t.id === selectedId) ?? themes[0] ?? null;
  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
  }, [selected]);
  const dirty = useMemo(() => Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(selected)), [draft, selected]);

  if (!draft || !selected) return <div className="page" />;
  const readOnly = draft.builtin;
  const set = (patch: Partial<Theme>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setBg = (patch: Partial<Theme['background']>) => setDraft((d) => (d ? { ...d, background: { ...d.background, ...patch } } : d));

  const duplicate = async () => {
    const copy = await call('themes.save', makeTheme(`${draft.name} (my version)`, draft));
    setSelectedId(copy.id);
    toast('success', 'Theme duplicated — you can now edit it');
  };
  const save = async () => {
    const saved = await call('themes.save', draft).catch(() => null);
    if (saved) toast('success', 'Theme saved');
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Delete theme', message: `Delete “${draft.name}”? Items using it will use the default theme.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await call('themes.delete', { id: draft.id });
    setSelectedId(settings?.defaultThemeId ?? themes[0]!.id);
  };
  const images = (media ?? []).filter((m) => m.kind === 'image');
  const videos = (media ?? []).filter((m) => m.kind === 'video');

  return (
    <div className="split-layout themes-layout">
      <aside className="panel list-panel">
        <header className="panel-header">
          <strong>Themes</strong>
          <button className="btn btn-small btn-primary" onClick={() => void call('themes.save', makeTheme('New theme')).then((t) => setSelectedId(t.id))}>
            <Icon name="plus" /> New
          </button>
        </header>
        <div className="scroll-list theme-list">
          {themes.map((t) => (
            <button key={t.id} className={`theme-row ${t.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(t.id)}>
              <div className="theme-thumb">
                <SlideView role="thumb" slide={sample(t, 'song')} mediaUrl={mediaUrl} />
              </div>
              <div className="list-main">
                <strong>{t.name}</strong>
                <span className="muted small">
                  {t.builtin ? 'Built-in' : 'Custom'}
                  {settings?.defaultThemeId === t.id ? ' · Default for songs' : ''}
                  {settings?.bibleThemeId === t.id ? ' · Default for Bible' : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel editor-panel">
        <header className="panel-header">
          <h2 className="editor-title">
            {draft.name} {readOnly && <span className="muted small">(built-in, duplicate it to change it)</span>}
          </h2>
          <div className="row-gap">
            <button className="btn btn-small" disabled={settings?.defaultThemeId === draft.id} onClick={() => void call('settings.update', { defaultThemeId: draft.id })}>
              Use for songs &amp; slides
            </button>
            <button className="btn btn-small" disabled={settings?.bibleThemeId === draft.id} onClick={() => void call('settings.update', { bibleThemeId: draft.id })}>
              Use for Bible
            </button>
            <button className="btn btn-small" onClick={() => void duplicate()}>
              <Icon name="copy" /> Duplicate
            </button>
            {!readOnly && (
              <>
                <button className="btn btn-small btn-ghost-danger" onClick={() => void remove()}>
                  <Icon name="trash" />
                </button>
                <button className="btn btn-small btn-primary" disabled={!dirty} onClick={() => void save()}>
                  Save
                </button>
              </>
            )}
          </div>
        </header>
        <div className="editor-scroll">
          <div className="theme-editor">
            <fieldset className="form-grid" disabled={readOnly}>
              <Field label="Name" wide>
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Font">
                <select value={FONTS.some((f) => f.value === draft.fontFamily) ? draft.fontFamily : ''} onChange={(e) => e.target.value && set({ fontFamily: e.target.value })}>
                  {!FONTS.some((f) => f.value === draft.fontFamily) && <option value="">{draft.fontFamily}</option>}
                  {FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Max text size: ${draft.fontSize}px`} hint="Text shrinks automatically when it does not fit.">
                <input type="range" min={30} max={160} value={draft.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
              </Field>
              <Field label="Weight">
                <select value={draft.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
                  {[300, 400, 500, 600, 700, 800].map((w) => (
                    <option key={w} value={w}>
                      {w === 400 ? 'Normal' : w === 700 ? 'Bold' : w}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Text colour">
                <input type="color" value={draft.color.startsWith('#') ? draft.color : '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
              </Field>
              <Field label="Horizontal alignment">
                <select value={draft.align} onChange={(e) => set({ align: e.target.value as Theme['align'] })}>
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </Field>
              <Field label="Vertical position">
                <select value={draft.vAlign} onChange={(e) => set({ vAlign: e.target.value as Theme['vAlign'] })}>
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom (lower third)</option>
                </select>
              </Field>
              <Field label={`Line spacing: ${draft.lineHeight.toFixed(2)}`}>
                <input type="range" min={0.9} max={2} step={0.05} value={draft.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} />
              </Field>
              <Field label={`Side margins: ${draft.marginX}%`}>
                <input type="range" min={0} max={30} value={draft.marginX} onChange={(e) => set({ marginX: Number(e.target.value) })} />
              </Field>
              <Field label={`Top margin: ${draft.marginTop}%`}>
                <input type="range" min={0} max={40} value={draft.marginTop} onChange={(e) => set({ marginTop: Number(e.target.value) })} />
              </Field>
              <Field label={`Bottom margin: ${draft.marginBottom}%`}>
                <input type="range" min={0} max={40} value={draft.marginBottom} onChange={(e) => set({ marginBottom: Number(e.target.value) })} />
              </Field>
              <div className="field-wide row-gap wrap">
                <label className="check">
                  <input type="checkbox" checked={draft.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italic
                </label>
                <label className="check">
                  <input type="checkbox" checked={draft.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /> UPPERCASE
                </label>
                <label className="check">
                  <input type="checkbox" checked={draft.shadow} onChange={(e) => set({ shadow: e.target.checked })} /> Shadow
                </label>
                <label className="check">
                  <input type="checkbox" checked={draft.outline} onChange={(e) => set({ outline: e.target.checked })} /> Outline
                </label>
                <label className="check">
                  <input type="checkbox" checked={draft.showFooter} onChange={(e) => set({ showFooter: e.target.checked })} /> Show footer (song title / reference)
                </label>
              </div>
              {draft.outline && (
                <>
                  <Field label="Outline colour">
                    <input type="color" value={draft.outlineColor.startsWith('#') ? draft.outlineColor : '#000000'} onChange={(e) => set({ outlineColor: e.target.value })} />
                  </Field>
                  <Field label={`Outline width: ${draft.outlineWidth}px`}>
                    <input type="range" min={1} max={8} value={draft.outlineWidth} onChange={(e) => set({ outlineWidth: Number(e.target.value) })} />
                  </Field>
                </>
              )}
              {draft.shadow && (
                <Field label={`Shadow softness: ${draft.shadowBlur}px`}>
                  <input type="range" min={0} max={40} value={draft.shadowBlur} onChange={(e) => set({ shadowBlur: Number(e.target.value) })} />
                </Field>
              )}
              <Field label={`Title size: ${draft.titleSize}px`}>
                <input type="range" min={40} max={200} value={draft.titleSize} onChange={(e) => set({ titleSize: Number(e.target.value) })} />
              </Field>
              <Field label="Title colour">
                <input type="color" value={draft.titleColor.startsWith('#') ? draft.titleColor : '#ffffff'} onChange={(e) => set({ titleColor: e.target.value })} />
              </Field>
              <Field label={`Footer size: ${draft.footerSize}px`}>
                <input type="range" min={14} max={60} value={draft.footerSize} onChange={(e) => set({ footerSize: Number(e.target.value) })} />
              </Field>

              <h3 className="field-wide">Background</h3>
              <Field label="Type">
                <select value={draft.background.type} onChange={(e) => setBg({ type: e.target.value as Theme['background']['type'] })}>
                  <option value="color">Solid colour</option>
                  <option value="gradient">Gradient</option>
                  <option value="image">Picture</option>
                  <option value="video">Moving video background</option>
                </select>
              </Field>
              {(draft.background.type === 'color' || draft.background.type === 'gradient') && (
                <Field label={draft.background.type === 'gradient' ? 'Colour 1' : 'Colour'}>
                  <input type="color" value={draft.background.color} onChange={(e) => setBg({ color: e.target.value })} />
                </Field>
              )}
              {draft.background.type === 'gradient' && (
                <>
                  <Field label="Colour 2">
                    <input type="color" value={draft.background.color2} onChange={(e) => setBg({ color2: e.target.value })} />
                  </Field>
                  <Field label={`Angle: ${draft.background.angle}°`}>
                    <input type="range" min={0} max={360} value={draft.background.angle} onChange={(e) => setBg({ angle: Number(e.target.value) })} />
                  </Field>
                </>
              )}
              {(draft.background.type === 'image' || draft.background.type === 'video') && (
                <Field label={draft.background.type === 'image' ? 'Picture (from Media)' : 'Video (from Media)'} wide hint="Import files in the Media tab first.">
                  <select value={draft.background.mediaPath ?? ''} onChange={(e) => setBg({ mediaPath: e.target.value || null })}>
                    <option value="">Choose…</option>
                    {(draft.background.type === 'image' ? images : videos).map((m) => (
                      <option key={m.id} value={m.path}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={`Darken background: ${Math.round(draft.background.dim * 100)}%`} hint="Improves readability over pictures.">
                <input type="range" min={0} max={0.9} step={0.05} value={draft.background.dim} onChange={(e) => setBg({ dim: Number(e.target.value) })} />
              </Field>
            </fieldset>

            <div className="theme-preview">
              <span className="field-label">Preview</span>
              {(['song', 'bible', 'title'] as const).map((k) => (
                <div key={k} className="monitor-frame" style={{ aspectRatio: settings?.previewAspect === '4:3' ? '4 / 3' : settings?.previewAspect === '16:10' ? '16 / 10' : '16 / 9' }}>
                  <SlideView role="monitor" slide={sample(draft, k)} mediaUrl={mediaUrl} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
