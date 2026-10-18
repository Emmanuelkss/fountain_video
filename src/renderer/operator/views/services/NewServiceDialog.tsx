import { useEffect, useState } from 'react';
import type { ServiceSummary } from '../../../../shared/types';
import { api, useData, useStore } from '../../store';
import { Field, Modal } from '../../components/ui';

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Creates a new service, optionally from a template, and opens it. */
export function NewServiceDialog({ onClose, templateId: initialTemplate }: { onClose: () => void; templateId?: string }) {
  const { call, setView } = useStore();
  const [templates] = useData<ServiceSummary[]>(['services'], () => api().invoke('services.list', { templates: true }));
  const [templateId, setTemplateId] = useState(initialTemplate ?? '');
  const [date, setDate] = useState(nextSunday());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialTemplate === undefined && templates && templates.length > 0 && templateId === '') setTemplateId(templates[0]!.id);
    // only on first load of templates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const template = templates?.find((t) => t.id === templateId);
  const defaultName = `${template ? template.name : 'Service'} ${date}`.trim();

  const create = async () => {
    setBusy(true);
    try {
      const finalName = name.trim() || defaultName;
      const service = templateId
        ? await call('services.duplicate', { id: templateId, asTemplate: false, name: finalName, date })
        : await call('services.save', { id: '', name: finalName, date, isTemplate: false, notes: '', items: [], createdAt: '', updatedAt: '' });
      await call('live.load', { serviceId: service.id });
      setView('live');
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New service"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void create()}>
            Create &amp; open
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Start from">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Empty service</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                Template: {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Name" wide>
          <input autoFocus placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
        </Field>
      </div>
    </Modal>
  );
}
