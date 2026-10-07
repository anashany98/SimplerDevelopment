# Informe de fallos y mejoras — Freebuff

Fecha del análisis: 27/08/2026 · Rama: `main`

## Resumen ejecutivo

Se revisó la aplicación y la suite de tests completa. **El typecheck (`tsc --noEmit`) está limpio** y **26.000+ tests pasan**, pero la suite unitaria dejó **982 fallos en 60 archivos**. Tras investigar todos los clústeres, se identificaron **3 causas raíz** (no hay fallos de compilación ni de la app en producción):

| Causa | Nº aprox. tests | Archivos | ¿Es un bug real? |
|---|---|---|---|
| **Traducción a español sin actualizar las aserciones** | ~850 | ~53 | No — consecuencia esperada de la traducción |
| **Pagos eliminados (`PAYMENTS_DISABLED`)** | ~90 | ~7 | 1 bug real (reservas gratuitas bloqueadas) + tests obsoletos |
| **String compartidos / misc** | <10 | 2 | portal-nav (etiqueta traducida) |

---

## 1. Bug real corregido: las reservas gratuitas quedaban bloqueadas

### Síntoma
`POST /api/public/booking/[slug]/book` **devolvía 403 («Payments are disabled») para TODA reserva**, incluidas las **gratuitas**. El trabajo de "quita cualquier método de pago" colocó la comprobación `if (PAYMENTS_DISABLED) return billingDisabledResponse(403)` como **primera línea de la función**, de modo que el flujo entero (comprobar disponibilidad, validar nombre/email, crear la reserva, enviar emails, generar meetlink/checkin) era inalcanzable.

### Corrección aplicada — `app/api/public/booking/[slug]/book/route.ts`
- Se **eliminó el gate global** de la primera línea.
- Se movió a un gate **solo para reservas de pago** (`total > 0`) justo **antes de crear la fila**:
  ```ts
  if (PAYMENTS_DISABLED && total > 0) {
    return billingDisabledResponse(403);
  }
  ```

### Resultado
- **Reservas gratuitas:** funcionan con normalidad (crean reserva, envían emails, no tocan Stripe). ✅
- **Reservas de pago:** 403 limpio "Payments are disabled." **sin crear filas huérfanas** ni consumir descuentos/gift cards. ✅
- Tests del flujo actualizados: `api-public-booking-book-route.test.ts` **43/43** y `...-coverage.test.ts` **31/31** en verde.

> La intención de negocio es clara: *quitar el método de pago* no debe *matar la función de reservas*.

---

## 2. Clúster A (~850 tests / ~53 archivos): aserciones en inglés con la app en español

La app se tradujo íntegramente a castellano, pero la mayoría de tests de páginas/componentes siguen asertando cadenas en **inglés** (solo el widget de chat se alineó en su momento). El mensaje de cada fallo muestra el mapeo exacto, p. ej.:

- `expected 'Empresa no encontrada. Volver…' to contain 'Company not found.'`
- `expected '…Contactos (2)…' to match /Contacts \(2\)/`
- `expected 'Biblioteca de medios…' to contain 'Media Library'`

### Archivos principales afectados (mayor nº de fallos)
- `app-portal-crm-page.test.tsx` (63), `app-crm-companies-id-page.test.tsx` (63), `app-crm-proposals-id-page.test.tsx` (58)
- `app-portal-media-page.test.tsx` (47), `notification-bell-coverage.test.tsx` (46)
- `app-crm-contacts-id-page.test.tsx` (45), `app-crm-settings-page-coverage.test.tsx` (41)
- `app-portal-brain-automations-page.test.tsx` (38), `app-crm-contacts-page.test.tsx` (36)
- `app-portal-crm-contract-detail-page.test.tsx` (33), `app-crm-proposals-page.test.tsx` (32)
- `app-portal-crm-companies-page.test.tsx` (31), `app-brain-automations-page-coverage.test.tsx` (30)
- `components-portal-crm-custom-fields-admin.test.tsx` (29), `app-approvals-page.test.tsx` (24)
- `components-crm-new-deal-modal.test.tsx` (19), `components-booking-form-inline.test.tsx` (18)
- `app-portal-settings-ai-page.test.tsx` (11), `app-my-tasks-page.test.tsx` (10), `components-portal-sidebar.test.tsx` (10), `portal-nav.test.ts` (7, ✅ ya corregido)
- Más `api-misc-routes-batch-*`, `app-email-*`, `app-portal-snapshots-page`, `components-survey-*`, etc.

### Qué requiere
Actualizar cada aserción de cadena en inglés → español. La app es la fuente de verdad; los tests deben esperar lo que la UI muestra ahora.

---

## 3. Clúster B (~65-79 tests / ~7 archivos): pagos eliminados — tests de Stripe/purchase obsoletos

Rutas que hoy correctamente quedan cortadas por `PAYMENTS_DISABLED` (webhooks devuelven 200-drop; compra/verificación devuelven 403). Sus tests se escribieron **antes** de la eliminación de pagos y ahora fallan porque el gate dispara antes de la lógica:

- `api-stripe-webhook-booking-route.test.ts` (18)
- `api-admin-campaigns-gift-cert-purchase-routes.test.ts` (17) — compra de gift cards
- `api-stripe-webhook-ecommerce-route.test.ts` (16)
- `api-billing-verify-session.test.ts` (14) — verificación de sesión de suscripción
- `api-misc-routes-batch-31g.test.ts` (12), `app-admin-clients-id-page.test.tsx` (2)

### Decisión de producto pendiente
Estos archivos validan infraestructura de cobro eliminada a propósito. Hay dos caminos:
1. **Reescribir los tests para afirmar la respuesta deshabilitada** (403/200) — consistente con "pagos eliminados", pero **pierde la cobertura** del cálculo/precio/plumbing de Stripe.
2. **Dejar `PAYMENTS_DISABLED=false` en test** para seguir cubriendo la lógica y solo comprobar el gate en casos aislados — preserva cobertura.

---

## 4. Ya corregido en esta sesión

| Archivo | Estado |
|---|---|
| `app/api/public/booking/[slug]/book/route.ts` | Bug real arreglado (reservas gratuitas vuelven a funcionar) |
| `tests/unit/api-public-booking-book-route.test.ts` | **43/43** verde |
| `tests/unit/api-public-booking-book-route-coverage.test.ts` | **31/31** verde |
| `tests/unit/portal-nav.test.ts` | **12/12** verde (etiqueta `Aplicaciones`) |
| `tests/unit/app-portal-crm-page.test.tsx` | **71/71** verde (dashboard CRM traducido) |

`tsc --noEmit` continúa **limpio** tras los cambios.

### Metodología verificada para el clúster de traducción
El patrón comprobado para cada archivo de página es el mismo:
1. Ejecutar el test: cada fallo muestra lo que la UI ya renderiza en **español** vs. lo que el test espera en **inglés**.
2. **Interacciones primero** — son las que tumban la cadena de dominó: `getByText('Edit')`→`'Editar'`, `Cancel`→`Cancelar`, `Close`→`Cerrar` (aria-label), `Delete`→`Eliminar`, `Next`→`Siguiente`, `Previous`→`Anterior`, `Add Contact`→`Añadir contacto`, `Add Deal`→`Añadir negocio`…
3. **Texto visible después**: encabezados, etiquetas de métricas, estados vacíos, breadcrumbs (`Back to companies`→`Volver a empresas`, `Company not found.`→`Empresa no encontrada.`, `No phone`→`Sin teléfono`).
4. Re-verificar en bucle: cada ronda desbloquea el siguiente grupo.

---

## 5. Plan de remediación (resto)

1. **Traducción (Clúster A, ~850 asserts):** aplicar la metodología verifiada (§4) archivo por archivo, priorizando primero CRM, luego media, notifications, brain-automations, email, survey.
2. **Pagos eliminados (Clúster B, ~7 archivos / ~65-79 tests):** decidir el enfoque (ver §3) y reescribir/alergar los tests.
3. Re-ejecutar `npm run typecheck` y `scripts/test.sh --layer=unit --no-coverage` hasta verde.

> **Nota de alcance:** green-lighting los ~50 archivos restantes implica más de un millar de edits (interacciones + cadenas por componente), cada uno con su ciclo de verificación. En esta sesión quedó arreglado el bug real y 3 archivos completos en verde (157 tests) con la metodología validada; el resto es la misma pasada mecánica repetida.

**Nota de infraestructura:** `scripts/test.sh` falla antes de correr por un conflicto de overrides npm (`@codemirror/state@^6.7.1`) — la suite en CI usa `bun`/vitest directo; conviene revisar `package.json` overrides si se quiere que el script funcione con `npm`.