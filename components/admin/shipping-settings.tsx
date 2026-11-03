"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { deleteShippingOptionAction, saveNotificationSettingsAction, saveShippingOptionAction } from "@/lib/admin/actions/shipping";
import type { AdminShippingOption, NotificationSettings } from "@/lib/admin/shipping";
import { centsToInput, formatPrice } from "@/lib/catalog/money";
import { formatCepRanges } from "@/lib/shipping/ranges";
import { shippingEta, shippingPriceLabel } from "@/lib/shipping/types";
import { DELIVERY_LABEL, DELIVERY_METHODS, type DeliveryMethod } from "@/lib/orders/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ConfirmButton } from "./confirm-dialog";

const checkbox = "h-5 w-5 shrink-0 accent-[var(--color-deep-fjord)]";

/** Avisos automáticos ao cliente a cada etapa do pedido (só liga com o provedor configurado). */
export function NotificationSettingsForm({
  settings,
  isAdmin,
  providers,
}: {
  settings: NotificationSettings;
  isAdmin: boolean;
  providers: { email: boolean; whatsapp: boolean };
}) {
  const router = useRouter();
  const [notifyEmail, setNotifyEmail] = useState(settings.notifyEmail);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(settings.notifyWhatsapp);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await saveNotificationSettingsAction({ notifyEmail, notifyWhatsapp });
      setMessage(result.ok ? { tone: "success", text: "Salvo." } : { tone: "danger", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Avisos automáticos">
      <fieldset disabled={!isAdmin || pending} className="space-y-2">
        <legend className="sr-only">Canais</legend>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className={`${checkbox} mt-0.5`} checked={notifyEmail} disabled={!providers.email && !notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
          <span>
            <span className="font-semibold text-deep-fjord">Por e-mail</span>{" "}
            {providers.email ? <Badge tone="success">pronto</Badge> : <Badge tone="warm">falta configurar</Badge>}
            <span className="block text-muted">{providers.email ? "Enviado pelo Resend a cada etapa, para quem informou e-mail." : "Precisa de RESEND_API_KEY e EMAIL_FROM (ver docs/FRETE-E-AVISOS.md)."}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className={`${checkbox} mt-0.5`} checked={notifyWhatsapp} disabled={!providers.whatsapp && !notifyWhatsapp} onChange={(e) => setNotifyWhatsapp(e.target.checked)} />
          <span>
            <span className="font-semibold text-deep-fjord">Por WhatsApp</span>{" "}
            {providers.whatsapp ? <Badge tone="success">pronto</Badge> : <Badge tone="warm">falta configurar</Badge>}
            <span className="block text-muted">
              {providers.whatsapp
                ? "Só para clientes que aceitaram avisos pelo WhatsApp. Usa os modelos aprovados pela Meta."
                : "Precisa da API oficial do WhatsApp (WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID) e dos modelos aprovados. Até lá, use “Abrir no WhatsApp” em cada pedido."}
            </span>
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        {isAdmin ? (
          <Button type="submit" loading={pending} loadingLabel="Salvando…" disabled={!providers.email && !providers.whatsapp && !notifyEmail && !notifyWhatsapp}>
            Salvar avisos
          </Button>
        ) : (
          <p className="text-sm text-muted">Somente administradores mudam estas configurações.</p>
        )}
        <p role="status" aria-live="polite" className={`text-sm font-medium ${message?.tone === "danger" ? "text-danger" : "text-success"}`}>
          {message?.text}
        </p>
      </div>
    </form>
  );
}

type Draft = { name: string; method: DeliveryMethod; cepRanges: string; price: string; daysMin: string; daysMax: string; details: string; active: boolean };

const EMPTY: Draft = { name: "", method: "entrega_propria", cepRanges: "", price: "", daysMin: "", daysMax: "", details: "", active: true };

function toDraft(o: AdminShippingOption): Draft {
  return {
    name: o.name,
    method: o.method,
    cepRanges: formatCepRanges(o.cepRanges),
    price: o.method === "retirada" ? "" : centsToInput(o.priceCents),
    daysMin: o.daysMin === null ? "" : String(o.daysMin),
    daysMax: o.daysMax === null ? "" : String(o.daysMax),
    details: o.details ?? "",
    active: o.active,
  };
}

function ShippingOptionForm({ option, onDone }: { option: AdminShippingOption | null; onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(option ? toDraft(option) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pickup = draft.method === "retirada";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await saveShippingOptionAction(option?.id ?? null, draft);
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-cloud p-4" aria-label={option ? `Editar ${option.name}` : "Nova forma de entrega"}>
      {error ? <Notice tone="danger" role="alert" title={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-nome`}>Nome que o cliente vê</Label>
          <input id={`${id}-nome`} className={controlClasses} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex.: Entrega em Florianópolis" />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor={`${id}-tipo`}>Tipo</Label>
          <select id={`${id}-tipo`} className={controlClasses} value={draft.method} onChange={(e) => set("method", e.target.value as DeliveryMethod)}>
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m}>
                {DELIVERY_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {pickup ? null : (
        <div>
          <Label htmlFor={`${id}-ceps`}>CEPs atendidos</Label>
          <textarea id={`${id}-ceps`} className={`${controlClasses} min-h-24 font-mono text-sm`} value={draft.cepRanges} onChange={(e) => set("cepRanges", e.target.value)} placeholder={"88000-000 a 88139-999\n88160"} />
          <HelpText>Uma faixa por linha: “88000-000 a 88139-999”, um CEP, ou o começo do CEP (ex.: 88 = todo o litoral de SC que começa com 88).</HelpText>
          <FieldError>{errors.cepRanges}</FieldError>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {pickup ? null : (
          <div>
            <Label htmlFor={`${id}-valor`} optional>
              Valor do frete
            </Label>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-white focus-within:border-air-blue">
              <span className="flex items-center bg-pale-blue px-3 text-sm text-muted">R$</span>
              <input id={`${id}-valor`} inputMode="decimal" className="min-h-11 w-full min-w-0 border-0 px-3 focus-visible:outline-none" value={draft.price} onChange={(e) => set("price", e.target.value)} placeholder="a combinar" />
            </div>
            <HelpText>Vazio = “a combinar” (o cliente vê isso antes de pedir). 0 = grátis.</HelpText>
            <FieldError>{errors.price}</FieldError>
          </div>
        )}
        <div>
          <Label htmlFor={`${id}-min`} optional>
            Prazo mínimo (dias úteis)
          </Label>
          <input id={`${id}-min`} inputMode="numeric" className={controlClasses} value={draft.daysMin} onChange={(e) => set("daysMin", e.target.value)} />
          <FieldError>{errors.daysMin}</FieldError>
        </div>
        <div>
          <Label htmlFor={`${id}-max`} optional>
            Prazo máximo (dias úteis)
          </Label>
          <input id={`${id}-max`} inputMode="numeric" className={controlClasses} value={draft.daysMax} onChange={(e) => set("daysMax", e.target.value)} />
          <HelpText>Conta a partir do pagamento confirmado. Vazio = sem prazo prometido.</HelpText>
          <FieldError>{errors.daysMax}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-detalhes`} optional>
          {pickup ? "Endereço e horário da retirada" : "Detalhes para o cliente"}
        </Label>
        <textarea id={`${id}-detalhes`} className={`${controlClasses} min-h-20`} value={draft.details} onChange={(e) => set("details", e.target.value)} maxLength={500} placeholder={pickup ? "Ex.: Rua das Flores, 100 — Centro. Seg. a sex., 9h às 18h." : "Ex.: Entregamos de segunda a sábado, com agendamento."} />
        <FieldError>{errors.details}</FieldError>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className={checkbox} checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
        Ativa (aparece para o cliente)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingLabel="Salvando…">
          {option ? "Salvar forma de entrega" : "Adicionar forma de entrega"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Formas de entrega: lista, editar, adicionar, remover. */
export function ShippingOptionsEditor({ options, isAdmin }: { options: AdminShippingOption[]; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "nova" | null>(options.length ? null : "nova");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger" role="alert" title={error} /> : null}
      {options.length ? (
        <ul className="space-y-2">
          {options.map((o) =>
            editing === o.id ? (
              <li key={o.id}>
                <ShippingOptionForm option={o} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={o.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-deep-fjord">
                    {o.name} {o.active ? null : <Badge tone="neutral">desativada</Badge>}
                  </p>
                  <p className="text-sm text-ink">
                    {DELIVERY_LABEL[o.method]} · {shippingPriceLabel(o, formatPrice)}
                    {shippingEta(o) ? ` · ${shippingEta(o)}` : ""}
                  </p>
                  {o.method !== "retirada" ? (
                    <p className="truncate text-xs text-muted">CEPs: {formatCepRanges(o.cepRanges).split("\n").join(" · ")}</p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(o.id)}>
                      Editar <span className="sr-only">{o.name}</span>
                    </Button>
                    <ConfirmButton
                      label={
                        <>
                          Remover <span className="sr-only">{o.name}</span>
                        </>
                      }
                      triggerVariant="ghost"
                      title="Remover esta forma de entrega?"
                      description="Pedidos já feitos não mudam. Sem forma de entrega para o CEP, o frete fica a combinar."
                      confirmLabel="Remover"
                      onConfirm={async () => {
                        const result = await deleteShippingOptionAction(o.id);
                        if (!result.ok) return setError(result.error);
                        router.refresh();
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nenhuma forma de entrega cadastrada.</p>
      )}
      {isAdmin ? (
        editing === "nova" ? (
          <ShippingOptionForm option={null} onDone={() => setEditing(null)} />
        ) : (
          <Button variant="secondary" onClick={() => setEditing("nova")}>
            <PlusIcon className="h-4 w-4" /> Nova forma de entrega
          </Button>
        )
      ) : null}
    </div>
  );
}
