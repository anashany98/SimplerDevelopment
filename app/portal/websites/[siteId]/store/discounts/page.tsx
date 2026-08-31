'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatMoney } from '@/lib/utils/money';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';

interface Discount {
  id: number;
  code: string;
  discountType: string;
  amount: number;
  minOrderAmount?: number | null;
  maxUses?: number | null;
  usedCount: number;
  active: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
}

interface DiscountForm {
  code: string;
  discountType: string;
  amount: number;
  minOrderAmount: number;
  maxUses: string;
  active: boolean;
  startsAt: string;
  expiresAt: string;
}

function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

const defaultForm: DiscountForm = {
  code: '',
  discountType: 'percent',
  amount: 0,
  minOrderAmount: 0,
  maxUses: '',
  active: true,
  startsAt: '',
  expiresAt: '',
};

export default function DiscountsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store/discounts`;

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState<DiscountForm>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(base);
      const data = await res.json();
      if (data.success) setDiscounts(data.data || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is reused by save/toggle handlers; setLoading(true) is intentional and does not cascade
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultForm });
    setShowModal(true);
    setError('');
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    setForm({
      code: d.code,
      discountType: d.discountType,
      // Stored amount is scaled x100 (percent stored as basis-points-of-percent,
      // fixed_amount stored as cents) — divide back down to the display unit.
      amount: d.discountType === 'free_shipping' ? 0 : d.amount / 100,
      minOrderAmount: d.minOrderAmount || 0,
      maxUses: d.maxUses != null ? String(d.maxUses) : '',
      active: d.active,
      startsAt: d.startsAt ? d.startsAt.slice(0, 10) : '',
      expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : '',
    });
    setShowModal(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        code: form.code.toUpperCase(),
        discountType: form.discountType,
        // API/DB store `amount` scaled x100: percent as basis-points-of-percent
        // (2000 = 20%) and fixed_amount in cents. free_shipping ignores amount.
        amount: form.discountType === 'free_shipping' ? 0 : Math.round(form.amount * 100),
        minOrderAmount: form.minOrderAmount || null,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        active: form.active,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
      };
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setEditing(null);
        setSuccess(editing ? 'Descuento actualizado.' : 'Descuento creado.');
        load();
      } else {
        setError(data.message || 'No se pudo guardar el descuento.');
      }
    } catch {
      setError('Algo salió mal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este código de descuento? Esta acción no se puede deshacer.')) return;
    try {
      await fetch(`${base}/${id}`, { method: 'DELETE' });
      setSuccess('Descuento eliminado.');
      load();
    } catch {
      setError('No se pudo eliminar.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Tienda"
        title="Códigos de descuento"
        subtitle="Crea y gestiona códigos de descuento para tu tienda."
        actions={
          <button onClick={openCreate} className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>
            Add Discount
          </button>
        }
      />

      {/* Messages */}
      {error && !showModal && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">{editing ? 'Editar descuento' : 'Nuevo descuento'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Código</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  required
                  placeholder="SAVE20"
                  className={`${inputClass} uppercase font-mono`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Tipo</label>
                  <select value={form.discountType} onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))} className={inputClass}>
                    <option value="percent">Porcentaje</option>
                    <option value="fixed_amount">Monto fijo ($)</option>
                    <option value="free_shipping">Envío gratis</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {form.discountType === 'percent' ? 'Discount (%)' : form.discountType === 'fixed_amount' ? 'Amount ($)' : 'Monto'}
                  </label>
                  <input
                    type="number"
                    step={form.discountType === 'percent' ? '1' : '0.01'}
                    min="0"
                    max={form.discountType === 'percent' ? '100' : undefined}
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    disabled={form.discountType === 'free_shipping'}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Pedido mínimo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={centsToDollars(form.minOrderAmount)}
                    onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: dollarsToCents(e.target.value) }))}
                    placeholder="Sin mínimo"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Usos máx.</label>
                  <input
                    type="number"
                    min="0"
                    value={form.maxUses}
                    onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
                    placeholder="Ilimitado"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Fecha de inicio</label>
                  <input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Fecha de fin</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label id="discount-active-label" className="text-sm font-medium text-foreground">Activo</label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
                    role="switch"
                    aria-checked={form.active}
                    aria-labelledby="discount-active-label"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.active ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-muted-foreground">{form.active ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>

              {error && showModal && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <span className="material-icons text-base">error</span>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={pBtnGhost}
                >Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`${pBtnPrimary} disabled:opacity-50`}
                >
                  {saving && <span className="material-icons text-base animate-spin">refresh</span>}
                  {editing ? 'Actualizar' : 'Crear'} Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discounts Table */}
      {discounts.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground/40 mb-2">sell</span>
          <h2 className="font-semibold text-foreground mb-1">Sin códigos de descuento</h2>
          <p className="text-sm text-muted-foreground">Crea tu primer código de descuento para ofrecer promociones.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Pedido mínimo</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Usos</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Fechas</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {discounts.map((d) => (
                  <tr key={d.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{d.code}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {d.discountType === 'free_shipping' ? 'Envío gratis' : d.discountType === 'fixed_amount' ? 'Fijo' : d.discountType}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {d.discountType === 'percent'
                        ? `${d.amount / 100}%`
                        : d.discountType === 'fixed_amount'
                        ? formatMoney(d.amount)
                        : '--'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.minOrderAmount ? formatMoney(d.minOrderAmount) : '--'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.usedCount}
                      {d.maxUses != null ? `/${d.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {d.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {d.startsAt ? new Date(d.startsAt).toLocaleDateString() : '--'}
                      {' - '}
                      {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-base">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
