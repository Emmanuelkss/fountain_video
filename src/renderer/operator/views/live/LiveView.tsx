/**
 * The main operator screen: service order (left), slides of the selected
 * item (centre) and the LIVE / PREVIEW monitors with controls (right).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaKind, ServiceItem, ServiceSummary, Slide } from '../../../../shared/types';
import type { DeckItem, LiveCommand } from '../../../../shared/live';
import { prettyCombo } from '../../../../shared/shortcuts';
import { api, useData, useStore } from '../../store';
import { Empty, Icon, ITEM_ICONS, useConfirm } from '../../components/ui';
import { SlideView } from '../../../common/SlideView';
import { useServiceEditor, type ServiceEditor } from './useService';
import { AnnouncementPicker, BiblePicker, MediaPicker, SongPicker } from './pickers';
import { ItemEditor } from './ItemEditor';
import { blankItem, headerItem, itemSubtitle } from '../../itemFactory';
import { NewServiceDialog } from '../services/NewServiceDialog';

type Picker = null | 'song' | 'bible' | 'announcement' | MediaKind;

export function sendLive(command: LiveCommand) {
  return api().invoke('live.command', command);
}

export function LiveView() {
  const { deck, live, selectedItemId, setSelectedItemId, searchRequest, settings } = useStore();
  const editor = useServiceEditor(deck.serviceId);
  const [picker, setPicker] = useState<Picker>(null);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [hovered, setHovered] = useState<{ itemId: string; index: number } | null>(null);
  const firstSearch = useRef(searchRequest);

  // Ctrl+F (search songs) opens the song picker.
  useEffect(() => {
    if (searchRequest !== firstSearch.current && deck.serviceId) setPicker('song');
  }, [searchRequest, deck.serviceId]);

  // Keep a valid selection: follow the live item, otherwise the first item.
  // (Checked against the edited service, which is ahead of the deck while autosaving.)
  const items = editor.service?.items;
  useEffect(() => {
    if (!items) return;
    if (selectedItemId && items.some((i) => i.id === selectedItemId)) return;
    const firstPresentable = items.find((i) => i.type !== 'header');
    setSelectedItemId(live.itemId && items.some((i) => i.id === live.itemId) ? live.itemId : (firstPresentable?.id ?? null));
  }, [items, live.itemId, selectedItemId, setSelectedItemId]);

  // When the live item changes (keyboard navigation), the slide grid follows it.
  const lastLiveItem = useRef<string | null>(null);
  useEffect(() => {
    if (live.itemId && live.itemId !== lastLiveItem.current) setSelectedItemId(live.itemId);
    lastLiveItem.current = live.itemId;
  }, [live.itemId, setSelectedItemId]);

  if (!deck.serviceId) return <NoService />;

  const selectedDeckItem = deck.items.find((i) => i.itemId === selectedItemId) ?? null;
  const previewSlide: Slide | null = hovered
    ? (deck.items.find((i) => i.itemId === hovered.itemId)?.slides[hovered.index] ?? null)
    : selectedDeckItem && selectedDeckItem.itemId !== live.itemId
      ? (selectedDeckItem.slides[0] ?? null)
      : live.nextSlide;
  const previewLabel = hovered ? 'Preview' : selectedDeckItem && selectedDeckItem.itemId !== live.itemId ? 'Preview · selected item' : 'Next';

  const addItems = async (items: ServiceItem[], show: boolean) => {
    setPicker(null);
    editor.insertItems(items, selectedItemId);
    const first = items[0]!;
    setSelectedItemId(first.id);
    if (show) {
      await editor.flush();
      await sendLive({ type: 'go', itemId: first.id, slideIndex: 0 });
    } else if (first.type === 'announcement') {
      setEditing(first);
    }
  };

  return (
    <div className="live-layout">
      <ServicePanel editor={editor} onAdd={setPicker} onEdit={setEditing} />
      <SlidesPanel item={selectedDeckItem} serviceItem={editor.service?.items.find((i) => i.id === selectedItemId) ?? null} onHover={setHovered} onEdit={setEditing} />
      <MonitorPanel previewSlide={previewSlide} previewLabel={previewLabel} shortcuts={settings?.shortcuts} />

      {picker === 'song' && <SongPicker onClose={() => setPicker(null)} onPick={addItems} />}
      {picker === 'bible' && <BiblePicker onClose={() => setPicker(null)} onPick={addItems} />}
      {picker === 'announcement' && <AnnouncementPicker onClose={() => setPicker(null)} onPick={(items) => addItems(items, false)} />}
      {(picker === 'image' || picker === 'video') && <MediaPicker kind={picker} onClose={() => setPicker(null)} onPick={addItems} />}
      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            editor.replaceItem(item);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NoService() {
  const { call, setView } = useStore();
  const [creating, setCreating] = useState(false);
  const [recent] = useData<ServiceSummary[]>(['services'], () => api().invoke('services.list', { templates: false }));
  return (
    <div className="no-service">
      <Empty icon="services" title="No service is open">
        Prepare the order of service: songs, Bible readings, announcements, pictures and videos.
      </Empty>
      <div className="row-gap center">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New service
        </button>
        <button className="btn" onClick={() => setView('services')}>
          <Icon name="services" /> All services &amp; templates
        </button>
      </div>
      {recent && recent.length > 0 && (
        <div className="recent">
          <h3>Recent services</h3>
          {recent.slice(0, 6).map((s) => (
            <button key={s.id} className="recent-row" onClick={() => void call('live.load', { serviceId: s.id })}>
              <strong>{s.name}</strong>
              <span className="muted">
                {s.date || 'No date'} · {s.itemCount} items
              </span>
            </button>
          ))}
        </div>
      )}
      {creating && <NewServiceDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ service order

function ServicePanel({ editor, onAdd, onEdit }: { editor: ServiceEditor; onAdd: (p: Picker) => void; onEdit: (item: ServiceItem) => void }) {
  const { deck, live, selectedItemId, setSelectedItemId, setView, call } = useStore();
  const confirm = useConfirm();
  const [menu, setMenu] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const service = editor.service;
  const deckById = useMemo(() => new Map(deck.items.map((d) => [d.itemId, d])), [deck]);

  if (!service) return <aside className="panel service-panel" />;

  // Items hidden because their group header is collapsed.
  const hidden = new Set<string>();
  let currentHeader: string | null = null;
  for (const item of service.items) {
    if (item.type === 'header') currentHeader = item.id;
    else if (currentHeader && collapsed.has(currentHeader)) hidden.add(item.id);
  }

  const remove = async (item: ServiceItem) => {
    const ok = await confirm({ title: 'Remove item', message: `Remove “${item.title}” from this service?`, confirmLabel: 'Remove', danger: true });
    if (ok) editor.removeItem(item.id);
  };

  return (
    <aside className="panel service-panel">
      <header className="panel-header">
        <div className="service-title">
          <input
            className="title-input"
            value={service.name}
            onChange={(e) => editor.update((s) => ({ ...s, name: e.target.value }))}
            onBlur={() => !service.name.trim() && editor.update((s) => ({ ...s, name: 'Untitled service' }))}
            aria-label="Service name"
          />
          <div className="service-meta">
            <input type="date" value={service.date} onChange={(e) => editor.update((s) => ({ ...s, date: e.target.value }))} aria-label="Service date" />
            <span className="muted save-state">{editor.saving ? 'Saving…' : 'Saved'}</span>
          </div>
        </div>
        <div className="row-gap">
          <div className="menu-anchor">
            <button className="btn btn-primary btn-small" onClick={() => setMenu((m) => !m)} aria-haspopup="menu">
              <Icon name="plus" /> Add
            </button>
            {menu && (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                {(
                  [
                    ['song', 'Song…', 'song'],
                    ['bible', 'Bible passage…', 'bible'],
                    ['announcement', 'Announcement…', 'announcement'],
                    ['image', 'Image…', 'image'],
                    ['video', 'Video…', 'video'],
                  ] as Array<[Picker, string, string]>
                ).map(([key, label, icon]) => (
                  <button
                    key={label}
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onAdd(key);
                    }}
                  >
                    <Icon name={icon} /> {label}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    const item = blankItem();
                    editor.insertItems([item], selectedItemId);
                    setSelectedItemId(item.id);
                  }}
                >
                  <Icon name="blank" /> Blank slide
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    const item = headerItem();
                    editor.insertItems([item], selectedItemId);
                    onEdit(item);
                  }}
                >
                  <Icon name="header" /> Group header
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-small" title="Open another service" onClick={() => setView('services')}>
            <Icon name="folder" />
          </button>
        </div>
      </header>

      <ol className="service-list" onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
        {service.items.length === 0 && (
          <li className="list-empty">
            Empty service. Use <strong>Add</strong> to add songs, Bible passages, announcements, images and videos.
          </li>
        )}
        {service.items.map((item, index) => {
          if (hidden.has(item.id)) return null;
          const d: DeckItem | undefined = deckById.get(item.id);
          const isLive = live.itemId === item.id;
          const isSelected = selectedItemId === item.id;
          const isHeader = item.type === 'header';
          return (
            <li
              key={item.id}
              className={[
                'service-item',
                isHeader ? 'is-header' : '',
                isSelected ? 'selected' : '',
                isLive ? 'is-live' : '',
                dropAt === index ? 'drop-before' : '',
                dragFrom === index ? 'dragging' : '',
              ].join(' ')}
              draggable
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY > rect.top + rect.height / 2 ? index + 1 : index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dropAt !== null) editor.moveItem(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              onClick={() => {
                if (isHeader) {
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                } else setSelectedItemId(item.id);
              }}
              onDoubleClick={() => !isHeader && void call('live.command', { type: 'go', itemId: item.id, slideIndex: 0 })}
              title={isHeader ? 'Click to collapse/expand' : 'Click to select · double-click to show'}
            >
              <span className="drag-handle" aria-hidden="true">
                <Icon name="grip" size={14} />
              </span>
              <Icon name={ITEM_ICONS[item.type] ?? 'blank'} size={15} className="item-icon" />
              <span className="item-text">
                <span className="item-title">
                  {isHeader && (collapsed.has(item.id) ? '▸ ' : '▾ ')}
                  {item.title || '(untitled)'}
                </span>
                {!isHeader && itemSubtitle(item) && <span className="item-sub">{itemSubtitle(item)}</span>}
              </span>
              {d?.error && (
                <span className="item-warn" title={d.error}>
                  <Icon name="warning" size={14} />
                </span>
              )}
              {isLive && <span className="live-pill">LIVE</span>}
              <span className="item-actions">
                <button className="btn-icon" title="Edit" onClick={(e) => (e.stopPropagation(), onEdit(item))}>
                  <Icon name="edit" size={14} />
                </button>
                <button className="btn-icon" title="Duplicate" onClick={(e) => (e.stopPropagation(), editor.duplicateItem(item.id))}>
                  <Icon name="copy" size={14} />
                </button>
                <button className="btn-icon" title="Remove" onClick={(e) => (e.stopPropagation(), void remove(item))}>
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </li>
          );
        })}
        {dropAt === service.items.length && <li className="drop-end" />}
      </ol>
    </aside>
  );
}

// ------------------------------------------------------------------ slides grid

function SlidesPanel({
  item,
  serviceItem,
  onHover,
  onEdit,
}: {
  item: DeckItem | null;
  serviceItem: ServiceItem | null;
  onHover: (h: { itemId: string; index: number } | null) => void;
  onEdit: (item: ServiceItem) => void;
}) {
  const { live, mediaUrl, settings } = useStore();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isLiveItem = item && live.itemId === item.itemId;

  // Keep the live slide visible while navigating with the keyboard.
  useEffect(() => {
    if (!isLiveItem) return;
    gridRef.current?.querySelector('.thumb.is-live')?.scrollIntoView({ block: 'nearest' });
  }, [isLiveItem, live.slideIndex]);

  if (!item) {
    return (
      <section className="panel slides-panel">
        <Empty icon="live" title="Select an item in the service order" />
      </section>
    );
  }
  const aspect = settings?.previewAspect === '4:3' ? '4 / 3' : settings?.previewAspect === '16:10' ? '16 / 10' : '16 / 9';
  return (
    <section className="panel slides-panel">
      <header className="panel-header">
        <div className="slides-title">
          <Icon name={ITEM_ICONS[item.type] ?? 'blank'} />
          <strong>{item.title || '(untitled)'}</strong>
          <span className="muted">
            {item.slides.length} slide{item.slides.length === 1 ? '' : 's'}
          </span>
          {isLiveItem && <span className="live-pill">LIVE</span>}
        </div>
        <div className="row-gap">
          {serviceItem && (
            <button className="btn btn-small" onClick={() => onEdit(serviceItem)}>
              <Icon name="edit" /> Edit
            </button>
          )}
          <button
            className="btn btn-small btn-live"
            disabled={item.slides.length === 0}
            onClick={() => void sendLive({ type: 'go', itemId: item.itemId, slideIndex: 0 })}
            title={`Show this item (${prettyCombo(settings?.shortcuts.goLive[0] ?? 'Enter')})`}
          >
            Show
          </button>
        </div>
      </header>
      {item.error && (
        <div className="banner banner-warn">
          <Icon name="warning" /> {item.error}
        </div>
      )}
      {serviceItem?.notes && <div className="banner banner-note">{serviceItem.notes}</div>}
      {item.type === 'header' ? (
        <Empty icon="header" title="Group header">
          Group headers organise the order of service and are never projected.
        </Empty>
      ) : (
        <div className="thumb-grid" ref={gridRef} onMouseLeave={() => onHover(null)}>
          {item.slides.map((slide, index) => {
            const active = isLiveItem && live.slideIndex === index;
            const newGroup = index === 0 || item.slides[index - 1]!.group !== slide.group;
            return (
              <button
                key={index}
                className={`thumb ${active ? 'is-live' : ''} ${newGroup ? 'group-start' : ''}`}
                style={{ aspectRatio: aspect }}
                onMouseEnter={() => onHover({ itemId: item.itemId, index })}
                onClick={() => void sendLive({ type: 'go', itemId: item.itemId, slideIndex: index })}
                aria-label={`Slide ${index + 1} ${slide.label}`}
                data-testid={`thumb-${index}`}
              >
                <SlideView role="thumb" slide={slide} mediaUrl={mediaUrl} />
                <span className="thumb-label">
                  <span className="thumb-num">{index + 1}</span>
                  {slide.label}
                </span>
                {active && <span className="thumb-live">LIVE</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ monitors & controls

function Kbd({ combo }: { combo: string | undefined }) {
  return combo ? <kbd>{prettyCombo(combo)}</kbd> : null;
}

function MonitorPanel({ previewSlide, previewLabel, shortcuts }: { previewSlide: Slide | null; previewLabel: string; shortcuts?: Record<string, string[]> }) {
  const { live, output, mediaUrl, call, settings, displays, themes } = useStore();
  const k = (action: string) => shortcuts?.[action]?.[0];
  const aspect = output.open && output.width > 0 ? `${output.width} / ${output.height}` : settings?.previewAspect === '4:3' ? '4 / 3' : settings?.previewAspect === '16:10' ? '16 / 10' : '16 / 9';
  const isVideo = live.slide?.kind === 'video' && !live.slide.missing;
  const display = displays.find((d) => d.id === output.displayId);
  const idleTheme = themes.find((t) => t.id === settings?.defaultThemeId) ?? null;
  return (
    <aside className="panel monitor-panel">
      <div className="monitor">
        <div className="monitor-head">
          <span className="monitor-label live">LIVE</span>
          {live.black && <span className="state-pill black">BLACK</span>}
          {live.clear && <span className="state-pill">TEXT CLEARED</span>}
          {!output.open && <span className="state-pill off">PROJECTOR OFF</span>}
        </div>
        <div className={`monitor-frame live-frame ${output.open ? 'on' : ''}`} style={{ aspectRatio: aspect }} data-testid="live-monitor">
          <SlideView role="monitor" slide={live.slide} idleTheme={idleTheme} black={live.black || !live.slide} clear={live.clear} mediaUrl={mediaUrl} />
        </div>
        <div className="monitor-caption muted">
          {output.open ? (output.windowed ? 'Test window on this screen' : `On ${display?.label ?? 'projector'}`) : 'The audience screen is off'}
          {output.message ? ` · ${output.message}` : ''}
        </div>
      </div>

      <div className="controls">
        <div className="control-row">
          <button className="ctl" onClick={() => void sendLive({ type: 'prevItem' })} title="Previous item">
            <Icon name="first" />
            <Kbd combo={k('prevItem')} />
          </button>
          <button className="ctl" onClick={() => void sendLive({ type: 'prevSection' })} title="Previous section">
            <Icon name="up" />
            <Kbd combo={k('prevSection')} />
          </button>
          <button className="ctl ctl-big" onClick={() => void sendLive({ type: 'prev' })} title="Previous slide" data-testid="ctl-prev">
            <Icon name="prev" size={22} />
            <Kbd combo={k('prevSlide')} />
          </button>
          <button className="ctl ctl-big" onClick={() => void sendLive({ type: 'next' })} title="Next slide" data-testid="ctl-next">
            <Icon name="next" size={22} />
            <Kbd combo={k('nextSlide')} />
          </button>
          <button className="ctl" onClick={() => void sendLive({ type: 'nextSection' })} title="Next section">
            <Icon name="down" />
            <Kbd combo={k('nextSection')} />
          </button>
          <button className="ctl" onClick={() => void sendLive({ type: 'nextItem' })} title="Next item">
            <Icon name="last" />
            <Kbd combo={k('nextItem')} />
          </button>
        </div>
        <div className="control-row">
          <button className={`ctl ctl-wide ${live.black ? 'active-black' : ''}`} onClick={() => void sendLive({ type: 'black' })} aria-pressed={live.black} data-testid="ctl-black">
            <Icon name="black" /> Black <Kbd combo={k('black')} />
          </button>
          <button className={`ctl ctl-wide ${live.clear ? 'active' : ''}`} onClick={() => void sendLive({ type: 'clear' })} aria-pressed={live.clear} data-testid="ctl-clear">
            <Icon name="clear" /> Clear text <Kbd combo={k('clear')} />
          </button>
          <button
            className={`ctl ctl-wide ${output.open ? 'active-live' : ''}`}
            onClick={() => void call('output.toggle', undefined)}
            aria-pressed={output.open}
            data-testid="ctl-output"
          >
            <Icon name="projector" /> {output.open ? 'Projector on' : 'Projector off'} <Kbd combo={k('toggleOutput')} />
          </button>
        </div>
        {isVideo && (
          <div className="control-row">
            <button className="ctl ctl-wide" onClick={() => void sendLive({ type: 'mediaToggle' })} data-testid="ctl-media">
              <Icon name={live.media.playing ? 'pause' : 'play'} /> {live.media.playing ? 'Pause video' : 'Play video'} <Kbd combo={k('mediaToggle')} />
            </button>
            <button className="ctl ctl-wide" onClick={() => void sendLive({ type: 'mediaRestart' })}>
              <Icon name="restart" /> Restart
            </button>
          </div>
        )}
      </div>

      <div className="monitor monitor-small">
        <div className="monitor-head">
          <span className="monitor-label">{previewLabel}</span>
          <span className="muted small">not on screen</span>
        </div>
        <div className="monitor-frame" style={{ aspectRatio: aspect }} data-testid="preview-monitor">
          <SlideView role="monitor" slide={previewSlide} idleTheme={idleTheme} black={!previewSlide} mediaUrl={mediaUrl} />
        </div>
      </div>
      <p className="hint shortcuts-hint">
        Song sections: press <kbd>1</kbd>–<kbd>9</kbd> for verses, <kbd>C</kbd> chorus, <kbd>B</kbd> bridge, <kbd>P</kbd> pre-chorus, <kbd>T</kbd> tag.
      </p>
    </aside>
  );
}
