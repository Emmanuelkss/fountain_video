/** Media library: import images/videos (copied into the library), preview, add to service, delete. */
import { useState } from 'react';
import type { MediaItem, MediaKind } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Empty, formatBytes, Icon, Modal, useConfirm } from '../../components/ui';
import { IMAGE_EXTS, VIDEO_EXTS } from '../../fileTypes';
import { mediaItem } from '../../itemFactory';
import { sendLive } from '../live/LiveView';

export function MediaView() {
  const { call, toast, mediaUrl, deck, selectedItemId } = useStore();
  const confirm = useConfirm();
  const [media] = useData<MediaItem[]>(['media'], () => api().invoke('media.list', undefined));
  const [filter, setFilter] = useState<'all' | MediaKind>('all');
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const list = (media ?? []).filter((m) => filter === 'all' || m.kind === filter);

  const importFiles = async () => {
    const paths = await call('dialog.openFiles', {
      title: 'Import images and videos',
      filters: [
        { name: 'Images and videos', extensions: [...IMAGE_EXTS, ...VIDEO_EXTS] },
        { name: 'Images', extensions: IMAGE_EXTS },
        { name: 'Videos', extensions: VIDEO_EXTS },
      ],
      multiple: true,
    });
    if (paths.length === 0) return;
    toast('info', `Copying ${paths.length} file${paths.length === 1 ? '' : 's'} into the media library…`);
    const report = await call('media.import', { paths });
    if (report.imported) toast('success', `${report.imported} file${report.imported === 1 ? '' : 's'} imported`);
    report.errors.forEach((e) => toast('warn', e));
  };

  const addToService = async (m: MediaItem, show: boolean) => {
    if (!deck.serviceId) {
      toast('warn', 'Open or create a service first (Live tab).');
      return;
    }
    const service = await call('services.get', { id: deck.serviceId });
    if (!service) return;
    const item = mediaItem(m);
    const index = service.items.findIndex((i) => i.id === selectedItemId);
    const items = service.items.slice();
    items.splice(index >= 0 ? index + 1 : items.length, 0, item);
    await call('services.save', { ...service, items });
    if (show) await sendLive({ type: 'go', itemId: item.id, slideIndex: 0 });
    else toast('success', `Added to “${service.name}”`);
  };

  const remove = async (m: MediaItem) => {
    const ok = await confirm({
      title: 'Delete from library',
      message: `Delete “${m.name}”? Services that use it will show “missing file”.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await call('media.delete', { id: m.id });
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Media</h1>
        <div className="row-gap">
          <div className="segmented" role="tablist">
            {(['all', 'image', 'video'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                {k === 'all' ? 'All' : k === 'image' ? 'Images' : 'Videos'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => void importFiles()}>
            <Icon name="import" /> Import files…
          </button>
        </div>
      </header>
      <p className="hint">
        Imported files are copied into FountainVideo’s library, so services keep working when a USB stick is removed. Videos: MP4 (H.264) or WebM work best.
      </p>
      {list.length === 0 ? (
        <Empty icon="media" title="No media yet">
          Import pictures for announcements and backgrounds, and videos to play during the service.
        </Empty>
      ) : (
        <div className="media-grid large">
          {list.map((m) => (
            <div key={m.id} className={`media-card ${m.exists === false ? 'missing' : ''}`}>
              <button className="media-thumb" onClick={() => m.exists !== false && setViewing(m)} title="Preview">
                {m.exists === false ? (
                  <span className="warn">
                    <Icon name="warning" /> File missing
                  </span>
                ) : m.kind === 'image' ? (
                  <img src={mediaUrl(m.path)} alt="" loading="lazy" />
                ) : (
                  <>
                    <video src={mediaUrl(m.path)} muted preload="metadata" />
                    <span className="media-kind">
                      <Icon name="video" size={14} />
                    </span>
                  </>
                )}
              </button>
              <div className="media-name" title={m.originalPath || m.name}>
                {m.name}
              </div>
              <div className="muted small">{formatBytes(m.size)}</div>
              <div className="media-actions">
                <button className="btn btn-small" disabled={m.exists === false} onClick={() => void addToService(m, false)}>
                  Add
                </button>
                <button className="btn btn-small btn-live" disabled={m.exists === false} onClick={() => void addToService(m, true)}>
                  Show
                </button>
                <button className="btn-icon" title="Delete" onClick={() => void remove(m)}>
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} wide>
          <div className="media-viewer">
            {viewing.kind === 'image' ? <img src={mediaUrl(viewing.path)} alt="" /> : <video src={mediaUrl(viewing.path)} controls autoPlay />}
          </div>
        </Modal>
      )}
    </div>
  );
}
