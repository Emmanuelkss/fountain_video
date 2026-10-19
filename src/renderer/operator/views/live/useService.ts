/**
 * Editing state of the open service with autosave: every change is saved
 * ~300 ms later (and immediately before the window closes), so nothing is
 * lost if the computer shuts down mid-service.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Service, ServiceItem } from '../../../../shared/types';
import { api, useStore } from '../../store';
import { moveItem, newId } from '../../../../shared/util';

export interface ServiceEditor {
  service: Service | null;
  saving: boolean;
  update(mutator: (service: Service) => Service): void;
  insertItems(items: ServiceItem[], afterId?: string | null): void;
  replaceItem(item: ServiceItem): void;
  removeItem(id: string): void;
  duplicateItem(id: string): void;
  moveItem(from: number, to: number): void;
  flush(): Promise<void>;
}

export function useServiceEditor(serviceId: string | null): ServiceEditor {
  const { call } = useStore();
  const [service, setService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef<Service | null>(null);
  const timer = useRef<number | null>(null);

  const save = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    setSaving(true);
    try {
      await call('services.save', toSave);
    } catch {
      // The toast already explains the problem; keep the local copy so the user can fix it.
    } finally {
      setSaving(false);
    }
  }, [call]);

  useEffect(() => {
    let cancelled = false;
    if (!serviceId) {
      setService(null);
      return undefined;
    }
    void api()
      .invoke('services.get', { id: serviceId })
      .then((s) => {
        if (!cancelled) setService(s);
      });
    const off = api().on('data:changed', ({ kind }) => {
      if ((kind === 'services' || kind === 'all') && !pending.current) {
        void api()
          .invoke('services.get', { id: serviceId })
          .then((s) => {
            if (!cancelled && !pending.current) setService(s);
          });
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [serviceId]);

  useEffect(() => {
    const onUnload = () => void save();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void save();
    };
  }, [save]);

  const update = useCallback(
    (mutator: (s: Service) => Service) => {
      setService((current) => {
        if (!current) return current;
        const next = mutator(current);
        pending.current = next;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), 300);
        return next;
      });
    },
    [save],
  );

  return {
    service,
    saving,
    update,
    insertItems: (items, afterId) =>
      update((s) => {
        const index = afterId ? s.items.findIndex((i) => i.id === afterId) : -1;
        const at = index >= 0 ? index + 1 : s.items.length;
        const list = s.items.slice();
        list.splice(at, 0, ...items);
        return { ...s, items: list };
      }),
    replaceItem: (item) => update((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? item : i)) })),
    removeItem: (id) => update((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })),
    duplicateItem: (id) =>
      update((s) => {
        const index = s.items.findIndex((i) => i.id === id);
        if (index < 0) return s;
        const copy = { ...structuredClone(s.items[index]!), id: newId() };
        const list = s.items.slice();
        list.splice(index + 1, 0, copy);
        return { ...s, items: list };
      }),
    moveItem: (from, to) => update((s) => ({ ...s, items: moveItem(s.items, from, to) })),
    flush: save,
  };
}
