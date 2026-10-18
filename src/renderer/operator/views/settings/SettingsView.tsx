/** Settings: projector screen, presentation defaults, shortcuts, backup & restore, data folders. */
import { useState } from 'react';
import type { AppSettings, BibleTranslation, ShortcutAction } from '../../../../shared/types';
import type { BackupInfo } from '../../../../shared/api';
import { comboFromEvent, DEFAULT_SHORTCUTS, findConflicts, prettyCombo, SHORTCUT_LABELS } from '../../../../shared/shortcuts';
import { api, useData, useStore } from '../../store';
import { Field, formatBytes, Icon, useConfirm } from '../../components/ui';
import { BACKUP_EXTS } from '../../fileTypes';

export function SettingsView() {
  const { settings, call } = useStore();
  if (!settings) return <div className="page" />;
  const update = (patch: Partial<AppSettings>) => void call('settings.update', patch);
  return (
    <div className="page settings-page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <div className="settings-grid">
        <DisplaySettings settings={settings} update={update} />
        <PresentationSettings settings={settings} update={update} />
        <ShortcutSettings settings={settings} update={update} />
        <BackupSettings />
        <AboutSettings />
      </div>
    </div>
  );
}

function DisplaySettings({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => void }) {
  const { displays, output, call } = useStore();
  return (
    <section className="card">
      <h2>
        <Icon name="projector" /> Projector / audience screen
      </h2>
      <div className="display-map">
        {displays.map((d, i) => {
          const chosen = output.open && output.displayId === d.id;
          return (
            <div key={d.id} className={`display-box ${chosen ? 'chosen' : ''} ${d.primary ? 'primary' : ''}`} title={d.label}>
              <strong>{i + 1}</strong>
              <span>
                {d.bounds.width}×{d.bounds.height}
              </span>
              <span className="muted small">{d.primary ? 'This screen' : chosen ? 'Projecting' : 'Extra screen'}</span>
            </div>
          );
        })}
      </div>
      <div className="form-grid">
        <Field label="Show the audience view on" wide hint={displays.length < 2 ? 'Only one screen is connected. Connect the projector (Windows: Win+P → “Extend”) or use test mode.' : undefined}>
          <select value={settings.outputDisplayId ?? ''} onChange={(e) => update({ outputDisplayId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Automatic (the screen that is not the main one)</option>
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="check field-wide">
          <input type="checkbox" checked={settings.windowedOutput} onChange={(e) => update({ windowedOutput: e.target.checked })} /> Test mode: show the audience view in a
          window instead of full screen
        </label>
        <div className="field-wide row-gap">
          <button className={`btn ${output.open ? 'btn-live' : 'btn-primary'}`} onClick={() => void call('output.toggle', undefined)}>
            <Icon name="projector" /> {output.open ? 'Turn projector off' : 'Turn projector on'}
          </button>
          <button className="btn" onClick={() => void call('output.identify', undefined)}>
            <Icon name="identify" /> Identify screens
          </button>
        </div>
        {output.message && <p className="hint field-wide">{output.message}</p>}
      </div>
    </section>
  );
}

function PresentationSettings({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => void }) {
  const [translations] = useData<BibleTranslation[]>(['bible'], () => api().invoke('bible.translations', undefined));
  return (
    <section className="card">
      <h2>
        <Icon name="live" /> Presentation
      </h2>
      <div className="form-grid">
        <Field label="Maximum lines per song slide" hint="Longer sections are split evenly. A blank line in the lyrics always starts a new slide.">
          <select value={settings.maxLinesPerSlide} onChange={(e) => update({ maxLinesPerSlide: Number(e.target.value) })}>
            <option value={0}>No limit</option>
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} lines
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bible verses per slide (default)">
          <select value={settings.defaultVersesPerSlide} onChange={(e) => update({ defaultVersesPerSlide: Number(e.target.value) })}>
            <option value={0}>Automatic</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default Bible translation">
          <select value={settings.defaultTranslationId ?? ''} onChange={(e) => update({ defaultTranslationId: e.target.value || null })}>
            <option value="">—</option>
            {(translations ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbreviation} — {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preview shape when no projector is on">
          <select value={settings.previewAspect} onChange={(e) => update({ previewAspect: e.target.value as AppSettings['previewAspect'] })}>
            <option value="16:9">16:9 (widescreen)</option>
            <option value="16:10">16:10</option>
            <option value="4:3">4:3 (older projectors)</option>
          </select>
        </Field>
        <label className="check field-wide">
          <input type="checkbox" checked={settings.advanceAcrossItems} onChange={(e) => update({ advanceAcrossItems: e.target.checked })} /> “Next slide” on the last
          slide continues to the next service item
        </label>
        <Field label="Operator screen colours">
          <select value={settings.operatorTheme} onChange={(e) => update({ operatorTheme: e.target.value as AppSettings['operatorTheme'] })}>
            <option value="dark">Dark (best in a dim room)</option>
            <option value="light">Light</option>
          </select>
        </Field>
      </div>
    </section>
  );
}

function ShortcutSettings({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => void }) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const conflicts = findConflicts(settings.shortcuts);
  const conflicted = new Set(conflicts.flatMap((c) => c.actions));
  const setFor = (action: ShortcutAction, combos: string[]) => update({ shortcuts: { ...settings.shortcuts, [action]: combos } });
  return (
    <section className="card card-wide">
      <h2>
        <Icon name="settings" /> Keyboard shortcuts
      </h2>
      <p className="hint">
        Shortcuts work anywhere except while typing in a text box (Ctrl+F, F5, Shift+Esc and Black also work while typing). Click “Add key”, then press the key
        combination.
      </p>
      {conflicts.length > 0 && <div className="banner banner-warn">Some keys are used twice: {conflicts.map((c) => prettyCombo(c.combo)).join(', ')}</div>}
      <table className="shortcut-table">
        <tbody>
          {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
            <tr key={action} className={conflicted.has(action) ? 'conflict' : ''}>
              <td>{SHORTCUT_LABELS[action]}</td>
              <td>
                <div className="row-gap wrap">
                  {settings.shortcuts[action].map((combo) => (
                    <span key={combo} className="kbd-chip">
                      <kbd>{prettyCombo(combo)}</kbd>
                      <button className="btn-icon" title="Remove" onClick={() => setFor(action, settings.shortcuts[action].filter((c) => c !== combo))}>
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                  {recording === action ? (
                    <input
                      className="recorder"
                      autoFocus
                      readOnly
                      value="Press keys…"
                      data-shortcut-recorder="true"
                      onBlur={() => setRecording(null)}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.key === 'Escape' && !e.shiftKey) {
                          setRecording(null);
                          return;
                        }
                        const combo = comboFromEvent(e);
                        if (!combo) return;
                        if (!settings.shortcuts[action].includes(combo)) setFor(action, [...settings.shortcuts[action], combo]);
                        setRecording(null);
                      }}
                    />
                  ) : (
                    <button className="btn btn-small" onClick={() => setRecording(action)}>
                      <Icon name="plus" size={12} /> Add key
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-small" onClick={() => update({ shortcuts: structuredClone(DEFAULT_SHORTCUTS) })}>
        Reset to defaults
      </button>
    </section>
  );
}

function BackupSettings() {
  const { call, toast, info } = useStore();
  const confirm = useConfirm();
  const [backups, reload] = useData<BackupInfo[]>(['all', 'settings'], () => api().invoke('backup.list', undefined));
  const create = async (choose: boolean) => {
    let path: string | undefined;
    if (choose) {
      const target = await call('dialog.saveFile', {
        title: 'Save a backup',
        defaultName: `FountainVideo backup ${new Date().toISOString().slice(0, 10)}.fvbackup`,
        filters: [{ name: 'FountainVideo backup', extensions: BACKUP_EXTS }],
      });
      if (!target) return;
      path = target;
    }
    const b = await call('backup.create', { path });
    toast('success', `Backup saved: ${b.path}`);
    reload();
  };
  const restore = async (path: string) => {
    const ok = await confirm({
      title: 'Restore backup',
      message: (
        <>
          Replace all current songs, services, themes and settings with this backup?
          <p className="hint">A safety copy of the current data is made first, so this can be undone.</p>
        </>
      ),
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    await call('backup.restore', { path });
    toast('success', 'Backup restored');
    reload();
  };
  const restoreFromFile = async () => {
    const files = await call('dialog.openFiles', { title: 'Choose a backup', filters: [{ name: 'FountainVideo backup', extensions: BACKUP_EXTS }] });
    if (files[0]) await restore(files[0]);
  };
  return (
    <section className="card card-wide">
      <h2>
        <Icon name="folder" /> Backup &amp; restore
      </h2>
      <p className="hint">
        FountainVideo saves automatically and keeps a backup every day, before every update and before every restore. Copy a backup to a USB stick to move your
        library to another computer. Media files are kept in the media folder ({info?.mediaDir}).
      </p>
      <div className="row-gap">
        <button className="btn btn-primary" onClick={() => void create(false)}>
          Back up now
        </button>
        <button className="btn" onClick={() => void create(true)}>
          Save a backup to…
        </button>
        <button className="btn" onClick={() => void restoreFromFile()}>
          Restore from file…
        </button>
        {info && (
          <button className="btn" onClick={() => void call('app.openPath', { path: info.backupDir })}>
            Open backups folder
          </button>
        )}
      </div>
      <table className="backup-table">
        <tbody>
          {(backups ?? []).slice(0, 15).map((b) => (
            <tr key={b.path}>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td className="muted">{b.automatic ? 'Automatic' : 'Manual'}</td>
              <td className="muted">{formatBytes(b.size)}</td>
              <td>
                <button className="btn btn-small" onClick={() => void restore(b.path)}>
                  Restore
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AboutSettings() {
  const { info, call } = useStore();
  if (!info) return null;
  return (
    <section className="card">
      <h2>About</h2>
      <p>
        <strong>FountainVideo {info.version}</strong> — works fully offline. No account required.
      </p>
      <dl className="about">
        <dt>Data folder</dt>
        <dd>{info.dataDir}</dd>
        <dt>Log files</dt>
        <dd>{info.logDir}</dd>
      </dl>
      <div className="row-gap">
        <button className="btn btn-small" onClick={() => void call('app.openPath', { path: info.dataDir })}>
          Open data folder
        </button>
        <button className="btn btn-small" onClick={() => void call('app.openPath', { path: info.logDir })}>
          Open logs
        </button>
      </div>
    </section>
  );
}
