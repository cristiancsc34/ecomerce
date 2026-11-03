"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { brand, hasAnyContact } from "@/config/brand";
import { cart, useCartItems } from "@/lib/cart/store";
import { lookupCepPublicAction, placeOrderAction } from "@/lib/orders/checkout-actions";
import { formatPhone } from "@/lib/orders/status";
import { useHydrated } from "@/lib/use-hydrated";
import { checkoutInputSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { Button, ButtonLink } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { BagIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/misc";
import { Notice } from "@/components/ui/notice";
import { CheckField, CheckoutSection, TextField } from "./fields";
import { OrderSummary } from "./order-summary";
import { useCartQuote } from "./use-cart-quote";

type DeliveryMethod = CheckoutInput["deliveryMethod"];
type Address = CheckoutInput["address"];
type Errors = Record<string, string>;

const EMPTY_ADDRESS: Address = {
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  referencia: "",
};

/** Id do controle de cada campo do contrato (chaves de fieldErrors). */
const fieldId = (key: string) => `checkout-${key.replace(/\./g, "-")}`;

/** Ordem dos campos na tela: o foco vai para o primeiro com erro. */
const FIELD_ORDER = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "deliveryMethod",
  "address.cep",
  "address.rua",
  "address.numero",
  "address.complemento",
  "address.bairro",
  "address.cidade",
  "address.uf",
  "address.referencia",
  "deliveryNotes",
  "whatsappOptIn",
  "acceptTerms",
] as const;
const KNOWN_FIELDS = new Set<string>(FIELD_ORDER);

const formatCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** Primeira mensagem de cada campo, com o caminho no formato do contrato ("address.cep"). */
function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const issue of issues) {
    const k = issue.path.map(String).join(".") || "form";
    out[k] ??= issue.message;
  }
  return out;
}

export function CheckoutView({ enabled }: { enabled: boolean }) {
  const hydrated = useHydrated();
  const items = useCartItems();
  const router = useRouter();
  const { state, inSync, refresh } = useCartQuote(items, enabled && hydrated);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("entrega_propria");
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [cepStatus, setCepStatus] = useState<{ text: string; tone: "muted" | "danger" } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const submitting = useRef(false);

  if (!enabled) {
    return (
      <Notice tone="info" title="A compra pelo site ainda não está ativa">
        <p>
          Para comprar agora, fale com o{" "}
          <Link href="/atendimento" className="link">
            atendimento da {brand.name}
          </Link>
          {hasAnyContact() ? "." : " (canais em configuração)."} Sua sacola continua guardada neste aparelho.
        </p>
        <p className="mt-2">
          <Link href="/carrinho" className="link">
            Voltar para a sacola
          </Link>
        </p>
      </Notice>
    );
  }

  if (placed) {
    return (
      <Notice tone="success" role="status" title="Pedido enviado!">
        Abrindo a página do seu pedido…
      </Notice>
    );
  }

  if (!hydrated) return <CheckoutSkeleton />;

  if (!items.length) {
    return (
      <div className="flex flex-col items-center rounded-lg bg-white px-6 py-12 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-pale-blue text-air-blue-ink">
          <BagIcon className="h-8 w-8" />
        </span>
        <h2 className="text-xl font-semibold">Sua sacola está vazia</h2>
        <p className="mt-2 max-w-sm text-muted">Escolha um produto para fazer o pedido.</p>
        <ButtonLink href="/produtos" className="mt-6">
          Ver produtos
        </ButtonLink>
      </div>
    );
  }

  if (state.status === "loading") return <CheckoutSkeleton />;

  if (state.status === "error") {
    return (
      <Notice tone="danger" role="alert" title="Não foi possível conferir a sacola">
        <p>{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refresh()}>
          Tentar de novo
        </Button>
      </Notice>
    );
  }

  const { quote } = state;
  const entrega = deliveryMethod === "entrega_propria";
  const blockedByDemo = quote.hasDemoItems;
  const canSubmit = inSync && !blockedByDemo && quote.lines.length > 0;

  const setAddr = (key: keyof Address) => (value: string) => setAddress((a) => ({ ...a, [key]: value }));
  const err = (key: string) => errors[key];
  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  async function findCep() {
    const digits = address.cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepStatus({ text: "Digite o CEP com 8 números.", tone: "danger" });
      return;
    }
    setCepLoading(true);
    setCepStatus({ text: "Buscando endereço…", tone: "muted" });
    try {
      const r = await lookupCepPublicAction(digits);
      if (!r.ok) {
        setCepStatus({ text: r.error, tone: "danger" });
        return;
      }
      setAddress((a) => ({
        ...a,
        rua: r.data.rua || a.rua,
        bairro: r.data.bairro || a.bairro,
        cidade: r.data.cidade || a.cidade,
        uf: r.data.uf || a.uf,
      }));
      setErrors((e) => {
        const next = { ...e };
        for (const k of ["address.cep", "address.rua", "address.bairro", "address.cidade", "address.uf"]) delete next[k];
        return next;
      });
      setCepStatus({ text: "Endereço encontrado. Confira e informe o número.", tone: "muted" });
      document.getElementById(fieldId("address.numero"))?.focus();
    } catch {
      setCepStatus({ text: "Não foi possível buscar o CEP agora. Preencha o endereço à mão.", tone: "danger" });
    } finally {
      setCepLoading(false);
    }
  }

  function showErrors(next: Errors, message: string) {
    setErrors(next);
    const unknown = Object.entries(next).filter(([k]) => !KNOWN_FIELDS.has(k));
    setFormError(unknown.length ? `${message} ${unknown.map(([, m]) => m).join(" ")}` : message);
    const first = FIELD_ORDER.find((k) => next[k]);
    const target = first ? document.getElementById(fieldId(first)) : document.getElementById("checkout-erro");
    // Espera a tela mostrar as mensagens antes de mover o foco.
    requestAnimationFrame(() => target?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting.current) return;

    const input: CheckoutInput = {
      customerName,
      customerPhone,
      customerEmail,
      whatsappOptIn,
      deliveryMethod,
      address: entrega ? address : EMPTY_ADDRESS,
      deliveryNotes: entrega ? deliveryNotes : "",
      acceptTerms,
      items: quote.normalizedItems.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
    };

    // Conferência rápida no navegador (o servidor confere tudo de novo).
    const local: Errors = {};
    const parsed = checkoutInputSchema.safeParse(input);
    if (!parsed.success) Object.assign(local, zodFieldErrors(parsed.error.issues));
    if (!whatsappOptIn) local.whatsappOptIn = "Marque para a loja poder falar com você pelo WhatsApp sobre o pedido.";
    if (!acceptTerms) local.acceptTerms = "Marque para confirmar que leu as políticas de entrega e de trocas.";
    if (Object.keys(local).length) {
      showErrors(local, "Revise os campos destacados.");
      return;
    }

    submitting.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const r = await placeOrderAction(input);
      if (!r.ok) {
        if (r.fieldErrors && Object.keys(r.fieldErrors).length) {
          showErrors(r.fieldErrors, r.error || "Revise os campos destacados.");
        } else {
          setErrors({});
          setFormError(r.error || "Não foi possível enviar o pedido. Tente de novo.");
          requestAnimationFrame(() => document.getElementById("checkout-erro")?.focus());
          // Preço ou estoque podem ter mudado: confere a sacola de novo.
          void refresh();
        }
        return;
      }
      const { code, token } = r.data;
      setPlaced(true);
      cart.clear();
      router.push(`/pedido/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}&novo=1`);
    } catch {
      setFormError("Sem conexão com a loja. Verifique sua internet e tente de novo.");
      requestAnimationFrame(() => document.getElementById("checkout-erro")?.focus());
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const blockReason = blockedByDemo
    ? "A sacola tem produtos de demonstração, que não podem ser pedidos."
    : !inSync
      ? "Confira as mudanças na sacola antes de enviar o pedido."
      : null;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Finalizar pedido"
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6"
    >
      <div className="min-w-0 space-y-3">
        {quote.issues.length ? (
          <Notice tone="warning" role="status" title="Sua sacola mudou">
            <ul className="list-disc space-y-1 pl-5">
              {quote.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {quote.lines.length ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    cart.replace(quote.normalizedItems);
                    void refresh(quote.normalizedItems);
                  }}
                >
                  Continuar com a sacola atualizada
                </Button>
              ) : null}
              <ButtonLink href="/carrinho" variant="ghost" size="sm">
                Revisar a sacola
              </ButtonLink>
            </div>
          </Notice>
        ) : null}
        {blockedByDemo ? (
          <Notice tone="demo" title="Produtos de demonstração">
            Os produtos de demonstração servem só para testar a loja e não podem ser pedidos.
          </Notice>
        ) : null}

        <CheckoutSection number={1} title="Seus dados" id="etapa-dados">
          <TextField
            id={fieldId("customerName")}
            label="Nome completo"
            value={customerName}
            onValueChange={setCustomerName}
            autoComplete="name"
            maxLength={120}
            error={err("customerName")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={fieldId("customerPhone")}
              label="Celular com WhatsApp"
              value={customerPhone}
              onValueChange={setCustomerPhone}
              onBlur={() => {
                const d = customerPhone.replace(/\D/g, "");
                if (d.length === 10 || d.length === 11) setCustomerPhone(formatPhone(d));
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 98765-4321"
              maxLength={30}
              help="Com DDD. É por ele que a loja confirma o pedido."
              error={err("customerPhone")}
            />
            <TextField
              id={fieldId("customerEmail")}
              label="E-mail"
              optional
              value={customerEmail}
              onValueChange={setCustomerEmail}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={200}
              error={err("customerEmail")}
            />
          </div>
        </CheckoutSection>

        <CheckoutSection number={2} title="Entrega" id="etapa-entrega">
          <fieldset aria-describedby={err("deliveryMethod") ? `${fieldId("deliveryMethod")}-error` : undefined}>
            <legend className="mb-2 text-sm font-medium text-ink">Como você quer receber?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["entrega_propria", "Entrega no endereço"],
                  ["retirada", "Retirar na loja"],
                ] as const
              ).map(([value, label], index) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-4 text-[0.9375rem] font-medium has-[:checked]:border-deep-fjord has-[:checked]:bg-pale-blue has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-air-blue"
                >
                  <input
                    id={index === 0 ? fieldId("deliveryMethod") : undefined}
                    type="radio"
                    name="deliveryMethod"
                    value={value}
                    checked={deliveryMethod === value}
                    onChange={() => setDeliveryMethod(value)}
                    className="h-5 w-5 shrink-0 accent-deep-fjord"
                  />
                  {label}
                </label>
              ))}
            </div>
            <FieldError id={`${fieldId("deliveryMethod")}-error`}>{err("deliveryMethod")}</FieldError>
          </fieldset>

          {entrega ? (
            <>
              <div>
                <Label htmlFor={fieldId("address.cep")}>CEP</Label>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="w-40 max-w-full">
                    <input
                      id={fieldId("address.cep")}
                      name="cep"
                      value={address.cep}
                      onChange={(e) => {
                        setAddr("cep")(formatCep(e.target.value));
                        setCepStatus(null);
                      }}
                      onKeyDown={(e) => {
                        // Enter no CEP busca o endereço em vez de enviar o pedido.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void findCep();
                        }
                      }}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      aria-invalid={err("address.cep") ? true : undefined}
                      aria-describedby={
                        [cepStatus ? "checkout-cep-status" : null, err("address.cep") ? `${fieldId("address.cep")}-error` : null]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      className={controlClasses}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void findCep()} loading={cepLoading} loadingLabel="Buscando…">
                    Buscar<span className="sr-only"> endereço pelo CEP</span>
                  </Button>
                </div>
                <p
                  id="checkout-cep-status"
                  role="status"
                  className={`text-sm ${cepStatus?.tone === "danger" ? "mt-1.5 font-medium text-danger" : cepStatus ? "mt-1.5 text-muted" : ""}`}
                >
                  {cepStatus?.text}
                </p>
                <FieldError id={`${fieldId("address.cep")}-error`}>{err("address.cep")}</FieldError>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <TextField
                  id={fieldId("address.rua")}
                  label="Rua"
                  value={address.rua}
                  onValueChange={setAddr("rua")}
                  autoComplete="address-line1"
                  maxLength={160}
                  error={err("address.rua")}
                />
                <TextField
                  id={fieldId("address.numero")}
                  label="Número"
                  value={address.numero}
                  onValueChange={setAddr("numero")}
                  inputMode="text"
                  maxLength={20}
                  error={err("address.numero")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={fieldId("address.complemento")}
                  label="Complemento"
                  optional
                  value={address.complemento}
                  onValueChange={setAddr("complemento")}
                  autoComplete="address-line2"
                  placeholder="Apto, bloco, casa"
                  maxLength={80}
                  error={err("address.complemento")}
                />
                <TextField
                  id={fieldId("address.bairro")}
                  label="Bairro"
                  value={address.bairro}
                  onValueChange={setAddr("bairro")}
                  autoComplete="address-level3"
                  maxLength={80}
                  error={err("address.bairro")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
                <TextField
                  id={fieldId("address.cidade")}
                  label="Cidade"
                  value={address.cidade}
                  onValueChange={setAddr("cidade")}
                  autoComplete="address-level2"
                  maxLength={80}
                  error={err("address.cidade")}
                />
                <TextField
                  id={fieldId("address.uf")}
                  label="UF"
                  value={address.uf}
                  onValueChange={(v) => setAddr("uf")(v.replace(/[^a-z]/gi, "").toUpperCase())}
                  autoComplete="address-level1"
                  maxLength={2}
                  placeholder="SP"
                  inputClassName="uppercase"
                  error={err("address.uf")}
                />
              </div>
              <TextField
                id={fieldId("address.referencia")}
                label="Ponto de referência"
                optional
                value={address.referencia}
                onValueChange={setAddr("referencia")}
                maxLength={200}
                error={err("address.referencia")}
              />
              <div>
                <Label htmlFor={fieldId("deliveryNotes")} optional>
                  Acesso para a entrega (andar, elevador, escada)
                </Label>
                <textarea
                  id={fieldId("deliveryNotes")}
                  name="deliveryNotes"
                  rows={3}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  maxLength={1000}
                  placeholder="Ex.: 3º andar, sem elevador, escada estreita, portaria"
                  aria-invalid={err("deliveryNotes") ? true : undefined}
                  aria-describedby={[`${fieldId("deliveryNotes")}-help`, err("deliveryNotes") ? `${fieldId("deliveryNotes")}-error` : null].filter(Boolean).join(" ")}
                  className={`${controlClasses} min-h-24`}
                />
                <HelpText id={`${fieldId("deliveryNotes")}-help`}>
                  Móveis grandes: saber disso antes ajuda a loja a planejar a entrega.
                </HelpText>
                <FieldError id={`${fieldId("deliveryNotes")}-error`}>{err("deliveryNotes")}</FieldError>
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-pale-blue p-4 text-[0.9375rem] text-ink">
              Você retira o pedido na loja. O dia e o horário são combinados com você pelo WhatsApp.
              {brand.legal.address ? (
                <>
                  <br />
                  <span className="font-medium">Endereço:</span> {brand.legal.address}
                </>
              ) : null}
            </p>
          )}
        </CheckoutSection>

        <CheckoutSection number={3} title="Pagamento" id="etapa-pagamento">
          <p className="text-[0.9375rem] text-ink">
            Depois de enviar o pedido, a loja confirma o pagamento (Pix ou link) e a data de entrega com você pelo WhatsApp. O
            frete é combinado nesse contato.
          </p>
          <CheckField
            id={fieldId("whatsappOptIn")}
            checked={whatsappOptIn}
            onCheckedChange={(v) => {
              setWhatsappOptIn(v);
              if (v) clearError("whatsappOptIn");
            }}
            error={err("whatsappOptIn")}
          >
            Aceito que a loja fale comigo pelo WhatsApp sobre este pedido.
          </CheckField>
          <CheckField
            id={fieldId("acceptTerms")}
            checked={acceptTerms}
            onCheckedChange={(v) => {
              setAcceptTerms(v);
              if (v) clearError("acceptTerms");
            }}
            error={err("acceptTerms")}
          >
            Li as políticas de{" "}
            <Link href="/politicas/entrega" target="_blank" rel="noopener" className="link">
              entrega<span className="sr-only"> (abre em nova aba)</span>
            </Link>{" "}
            e de{" "}
            <Link href="/politicas/trocas-e-devolucoes" target="_blank" rel="noopener" className="link">
              trocas<span className="sr-only"> (abre em nova aba)</span>
            </Link>
            .
          </CheckField>
        </CheckoutSection>
      </div>

      <aside aria-labelledby="resumo-titulo" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <OrderSummary quote={quote}>
          {formError ? (
            <div id="checkout-erro" tabIndex={-1} className="outline-none">
              <Notice tone="danger" role="alert" title="Pedido não enviado">
                {formError}
              </Notice>
            </div>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!canSubmit}
            loading={saving}
            loadingLabel="Enviando pedido…"
            aria-describedby={blockReason ? "checkout-bloqueio" : undefined}
          >
            Enviar pedido
          </Button>
          {blockReason ? (
            <p id="checkout-bloqueio" className="text-sm font-medium text-ink">
              {blockReason}
            </p>
          ) : null}
          <p className="text-sm text-muted">
            Prefere falar com alguém?{" "}
            <Link href="/atendimento" className="link">
              Fale com o atendimento
            </Link>
            .
          </p>
        </OrderSummary>
      </aside>
    </form>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6" aria-busy="true" aria-label="Carregando pedido">
      <div className="space-y-3">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
