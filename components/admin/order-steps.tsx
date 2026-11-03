"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setOrderStatusAction } from "@/lib/admin/actions/orders";
import { orderMessage, whatsappMessageLink, type OrderMessageInput } from "@/lib/orders/messages";
import { STATUS_LABEL, staffActions, type DeliveryMethod, type OrderStatus } from "@/lib/orders/status";
import { Button } from "@/components/ui/button";
import { controlClasses, HelpText, Label } from "@/components/ui/field";
import { ChatIcon, CopyIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

type Delivery = { carrier: string; trackingCode: string; trackingUrl: string; scheduledDate: string; scheduledWindow: string };

const WINDOWS = ["Manhã (8h às 12h)", "Tarde (13h às 18h)", "Dia todo (8h às 18h)"];

/**
 * Próximo passo do pedido (botões conforme a etapa e a forma de entrega) e o
 * aviso ao cliente: a mensagem da etapa atual, pronta para abrir no WhatsApp.
 */
export function OrderSteps({
  orderId,
  status,
  deliveryMethod,
  customerPhone,
  whatsappOptIn,
  canEdit,
  message,
  delivery,
}: {
  orderId: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  customerPhone: string | null;
  whatsappOptIn: boolean;
  canEdit: boolean;
  /** Dados para montar a mensagem ao cliente (etapa atual). */
  message: OrderMessageInput;
  delivery: Delivery;
}) {
  const router = useRouter();
  const actions = staffActions(status, deliveryMethod);
  const [chosen, setChosen] = useState<OrderStatus | null>(null);
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [form, setForm] = useState<Delivery>(delivery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState(false);
  const [copied, setCopied] = useState(false);

  const askDelivery = chosen === "enviado";
  const text = orderMessage(message);
  const waLink = customerPhone ? whatsappMessageLink(customerPhone, text) : null;

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const r = await setOrderStatusAction(orderId, {
      status: chosen,
      publicNote,
      internalNote,
      delivery: askDelivery
        ? deliveryMethod === "transportadora"
          ? { carrier: form.carrier, trackingCode: form.trackingCode, trackingUrl: form.trackingUrl }
          : { scheduledDate: form.scheduledDate, scheduledWindow: form.scheduledWindow }
        : {},
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setChosen(null);
    setPublicNote("");
    setInternalNote("");
    setJustMoved(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit && actions.length ? (
        <section aria-labelledby="proximo-passo" className="rounded-2xl border border-line bg-white p-4 sm:p-6">
          <h2 id="proximo-passo" className="text-lg font-bold">
            Próximo passo
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.to}
                type="button"
                variant={chosen === a.to ? "primary" : a.primary ? "primary" : a.to === "cancelado" ? "ghost" : "secondary"}
                aria-pressed={chosen === a.to}
                onClick={() => {
                  setChosen(chosen === a.to ? null : a.to);
                  setError(null);
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
          {chosen ? (
            <div className="mt-4 space-y-4 rounded-xl border border-line bg-cloud p-4" data-testid="confirmar-etapa">
              <p className="font-semibold">
                Mudar para: <span className="text-deep-fjord">{STATUS_LABEL[chosen]}</span>
              </p>
              {askDelivery && deliveryMethod === "transportadora" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="s-carrier">Transportadora</Label>
                    <input id="s-carrier" className={controlClasses} value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="s-code" optional>
                      Código de rastreio
                    </Label>
                    <input id="s-code" className={controlClasses} value={form.trackingCode} onChange={(e) => setForm({ ...form, trackingCode: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="s-url" optional>
                      Link de rastreio
                    </Label>
                    <input id="s-url" type="url" inputMode="url" placeholder="https://" className={controlClasses} value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} />
                  </div>
                </div>
              ) : askDelivery ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="s-date">Data combinada</Label>
                    <input id="s-date" type="date" className={controlClasses} value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="s-window">Período</Label>
                    <input id="s-window" list="s-windows" className={controlClasses} value={form.scheduledWindow} onChange={(e) => setForm({ ...form, scheduledWindow: e.target.value })} />
                    <datalist id="s-windows">
                      {WINDOWS.map((w) => (
                        <option key={w} value={w} />
                      ))}
                    </datalist>
                    <HelpText>Só o que foi combinado com o cliente.</HelpText>
                  </div>
                </div>
              ) : null}
              <div>
                <Label htmlFor="s-public" optional>
                  Recado para o cliente
                </Label>
                <textarea id="s-public" rows={2} maxLength={500} className={controlClasses} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} />
                <HelpText>Aparece no acompanhamento do pedido e na mensagem do WhatsApp.</HelpText>
              </div>
              <div>
                <Label htmlFor="s-internal" optional>
                  Nota interna
                </Label>
                <textarea id="s-internal" rows={2} maxLength={1000} className={controlClasses} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
              </div>
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={confirm} loading={busy} loadingLabel="Salvando…">
                  Confirmar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setChosen(null)}>
                  Voltar
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="avisar-cliente" className="rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="avisar-cliente">
        <h2 id="avisar-cliente" className="text-lg font-bold">
          Avisar o cliente
        </h2>
        {justMoved ? (
          <Notice tone="success" className="mt-3" role="status">
            Etapa atualizada. Agora avise o cliente.
          </Notice>
        ) : null}
        <p className="mt-1 text-sm text-muted">Mensagem da etapa atual ({STATUS_LABEL[status]}), com o link de acompanhamento.</p>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-cloud p-3 font-sans text-sm text-ink">{text}</pre>
        {!whatsappOptIn && customerPhone ? (
          <p className="mt-2 text-sm text-[#8a4b0f]">O cliente não marcou que aceita avisos pelo WhatsApp. Confirme com ele antes de mandar.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1E6B47] px-5 font-semibold text-white hover:bg-[#17583a]"
            >
              <ChatIcon className="h-5 w-5" /> Abrir no WhatsApp
            </a>
          ) : (
            <p className="text-sm text-muted">Sem celular no pedido: copie a mensagem e envie pelo canal combinado.</p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <CopyIcon className="h-5 w-5" /> {copied ? "Copiada!" : "Copiar mensagem"}
          </Button>
        </div>
      </section>
    </div>
  );
}
