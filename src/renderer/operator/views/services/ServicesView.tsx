/** Lists saved services and templates: open, create, duplicate, save as template, delete. */
import { useState } from 'react';
import type { ServiceSummary } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Empty, Icon, useConfirm } from '../../components/ui';
import { NewServiceDialog } from './NewServiceDialog';

export function ServicesView() {
  const { call, setView, deck, toast } = useStore();
  const confirm = useConfirm();
  const [services] = useData<ServiceSummary[]>(['services'], () => api().invoke('services.list', { templates: false }));
  const [templates] = useData<ServiceSummary[]>(['services'], () => api().invoke('services.list', { templates: true }));
  const [creating, setCreating] = useState<{ templateId?: string } | null>(null);

  const open = async (s: ServiceSummary) => {
    await call('live.load', { serviceId: s.id });
    setView('live');
  };

  const remove = async (s: ServiceSummary) => {
    const ok = await confirm({
      title: s.isTemplate ? 'Delete template' : 'Delete service',
      message: `Delete “${s.name}”? This cannot be undone (a backup is made every day).`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await call('services.delete', { id: s.id });
  };

  const saveAsTemplate = async (s: ServiceSummary) => {
    const t = await call('services.duplicate', { id: s.id, asTemplate: true, name: s.name.replace(/\s*\d{4}-\d{2}-\d{2}$/, '') || s.name, date: '' });
    toast('success', `Template “${t.name}” saved`);
  };

  const editTemplate = async (s: ServiceSummary) => {
    await call('live.load', { serviceId: s.id });
    setView('live');
    toast('info', `Editing template “${s.name}”. Changes apply to services created from it later.`);
  };

  const Row = ({ s }: { s: ServiceSummary }) => (
    <div className={`list-row ${deck.serviceId === s.id ? 'selected' : ''}`}>
      <div className="list-main">
        <strong>{s.name}</strong>
        <span className="muted">
          {s.isTemplate ? 'Template' : s.date || 'No date'} · {s.itemCount} item{s.itemCount === 1 ? '' : 's'} · updated {new Date(s.updatedAt).toLocaleString()}
        </span>
      </div>
      <div className="row-gap">
        {s.isTemplate ? (
          <>
            <button className="btn btn-small btn-primary" onClick={() => setCreating({ templateId: s.id })}>
              <Icon name="plus" /> New service from this
            </button>
            <button className="btn btn-small" onClick={() => void editTemplate(s)}>
              <Icon name="edit" /> Edit
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-small btn-primary" onClick={() => void open(s)}>
              Open
            </button>
            <button className="btn btn-small" onClick={() => void call('services.duplicate', { id: s.id })} title="Duplicate">
              <Icon name="copy" />
            </button>
            <button className="btn btn-small" onClick={() => void saveAsTemplate(s)}>
              Save as template
            </button>
          </>
        )}
        <button className="btn btn-small btn-ghost-danger" onClick={() => void remove(s)} title="Delete">
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Services</h1>
        <button className="btn btn-primary" onClick={() => setCreating({})}>
          <Icon name="plus" /> New service
        </button>
      </header>
      <div className="page-columns">
        <section className="card">
          <h2>Services</h2>
          {services && services.length === 0 && <Empty icon="services" title="No services yet" />}
          {services?.map((s) => <Row key={s.id} s={s} />)}
        </section>
        <section className="card">
          <h2>Templates</h2>
          <p className="hint">Templates hold the usual order of a recurring meeting. New services copy them.</p>
          {templates && templates.length === 0 && <Empty icon="services" title="No templates" />}
          {templates?.map((s) => <Row key={s.id} s={s} />)}
        </section>
      </div>
      {creating && <NewServiceDialog templateId={creating.templateId} onClose={() => setCreating(null)} />}
    </div>
  );
}
