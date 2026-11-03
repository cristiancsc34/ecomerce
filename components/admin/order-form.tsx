"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createOrderAction, lookupCepAction, updateOrderAction } from "@/lib/admin/actions/orders";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/catalog/money";
import {
  DELIVERY_LABEL,
  DELIVERY_METHODS,
  formatPhone,
  PAYMENT_LABEL,
  PAYMENT_METHODS,
  type DeliveryMethod,
  type OrderAddress,
  type PaymentMethod,
} from "@/lib/orders/status";
import { Button } from "@/components/ui/button";
import { controlClasses, FieldError, HelpText, Label } from "@/components/ui/field";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";

/** Produto do catálogo para escolher no pedido (preço confirmado, se houver). */
export type OrderProductOption = {
  id: string;
  name: string;
  priceCents: number | null;
  variants: { id: string; name: string; priceCents: number | null }[];
};

type ItemRow = { key: string; productId: string; variantId: string; name: string; variantName: string; price: string; quantity: number };

export type OrderFormInitial = {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  whatsappOptIn: boolean;
  address: OrderAddress;
  deliveryMethod: DeliveryMethod;
  deliveryNotes: string | null;
  assembly: boolean;
  shippingCents: number | null;
  discountCents: number;
  paymentMethod: PaymentMethod | null;
  internalNotes: string | null;
  items: { productId: string | null; variantId: string | null; name: string; variantName: string | null; unitPriceCents: number; quantity: number }[];
};

const newKey = () => Math.random().toString(36).slice(2);

function Section({ title, children, help }: { title: string; children: ReactNode; help?: string }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {help ? <p className="mt-0.5 text-sm text-muted">{help}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function OrderForm({
  products,
  orderId,
  initial,
  itemsLocked = false,
}: {
  products: OrderProductOption[];
  /** Editando um pedido existente. */
  orderId?: string;
  initial?: OrderFormInitial;
  /** Depois do envio os itens não mudam (regra do banco). */
  itemsLocked?: boolean;
}) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(formatPhone(initial?.customerPhone));
  const [customerEmail, setCustomerEmail] = useState(initial?.customerEmail ?? "");
  const [whatsappOptIn, setWhatsappOptIn] = useState(initial?.whatsappOptIn ?? true);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(initial?.deliveryMethod ?? "entrega_propria");
  const [address, setAddress] = useState<Required<OrderAddress>>({
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    referencia: "",
    ...(initial?.address ?? {}),
  });
  const [deliveryNotes, setDeliveryNotes] = useState(initial?.deliveryNotes ?? "");
  const [assembly, setAssembly] = useState(initial?.assembly ?? false);
  const [shipping, setShipping] = useState(initial ? centsToInput(initial.shippingCents) : "");
  const [discount, setDiscount] = useState(initial?.discountCents ? centsToInput(initial.discountCents) : "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(initial?.paymentMethod ?? "");
  const [paid, setPaid] = useState(false);
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [items, setItems] = useState<ItemRow[]>(
    initial?.items.map((i) => ({
      key: newKey(),
      productId: i.productId ?? "",
      variantId: i.variantId ?? "",
      name: i.name,
      variantName: i.variantName ?? "",
      price: centsToInput(i.unitPriceCents),
      quantity: i.quantity,
    })) ?? [{ key: newKey(), productId: "", variantId: "", name: "", variantName: "", price: "", quantity: 1 }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cepStatus, setCepStatus] = useState<string | null>(null);

  const retirada = deliveryMethod === "retirada";
  const subtotal = items.reduce((sum, i) => sum + (parsePriceToCents(i.price) ?? 0) * i.quantity, 0);
  const shippingCents = retirada ? 0 : parsePriceToCents(shipping);
  const discountCents = parsePriceToCents(discount) ?? 0;
  const total = subtotal + (shippingCents ?? 0) - discountCents;

  const setItem = (key: string, patch: Partial<ItemRow>) => setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const field = (key: keyof typeof address) => ({
    value: address[key],
    onChange: (e: { target: { value: string } }) => setAddress((a) => ({ ...a, [key]: e.target.value })),
  });

  function pickProduct(row: ItemRow, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return setItem(row.key, { productId: "", variantId: "", variantName: "" });
    const variant = product.variants[0];
    const price = variant?.priceCents ?? product.priceCents;
    setItem(row.key, {
      productId,
      name: product.name,
      variantId: variant?.id ?? "",
      variantName: variant?.name ?? "",
      // Preço do catálogo, quando confirmado; a equipe pode ajustar (preço combinado).
      price: price !== null && price !== undefined ? centsToInput(price) : row.price,
    });
  }

  function pickVariant(row: ItemRow, variantId: string) {
    const variant = products.find((p) => p.id === row.productId)?.variants.find((v) => v.id === variantId);
    setItem(row.key, { variantId, variantName: variant?.name ?? "", price: variant?.priceCents != null ? centsToInput(variant.priceCents) : row.price });
  }

  async function findCep() {
    setCepStatus("Buscando…");
    const r = await lookupCepAction(address.cep);
    if (!r.ok) return setCepStatus(r.error);
    setAddress((a) => ({ ...a, rua: r.data.rua || a.rua, bairro: r.data.bairro || a.bairro, cidade: r.data.cidade || a.cidade, uf: r.data.uf || a.uf }));
    setCepStatus("Endereço preenchido. Confira e informe o número.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const priceErrors: Record<string, string> = {};
    items.forEach((i, index) => {
      if (parsePriceToCents(i.price) === null) priceErrors[`items.${index}.unitPriceCents`] = "Informe o preço combinado.";
    });
    if (Object.keys(priceErrors).length) {
      setErrors(priceErrors);
      setSaving(false);
      return setMessage("Revise os campos destacados.");
    }
    const input = {
      customerName,
      customerPhone,
      customerEmail,
      whatsappOptIn,
      address,
      deliveryMethod,
      deliveryNotes,
      assembly,
      shippingCents,
      discountCents,
      paymentMethod: paymentMethod || null,
      internalNotes,
      items: items.map((i) => ({
        productId: i.productId || null,
        variantId: i.variantId || null,
        name: i.name,
        variantName: i.variantName || null,
        unitPriceCents: parsePriceToCents(i.price) ?? 0,
        quantity: i.quantity,
      })),
      ...(orderId ? {} : { status: paid ? ("pago" as const) : ("recebido" as const) }),
    };
    const r = orderId ? await updateOrderAction(orderId, input, !itemsLocked) : await createOrderAction(input);
    setSaving(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return setMessage(r.error);
    }
    setErrors({});
    if (orderId) {
      setMessage("Alterações salvas.");
      router.refresh();
    } else if (r.data && "id" in r.data) {
      router.push(`/admin/pedidos/${r.data.id}`);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={orderId ? "Editar pedido" : "Novo pedido"}>
      <Section title="Cliente">
        <div>
          <Label htmlFor="o-name">Nome</Label>
          <input id="o-name" className={controlClasses} value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" />
          <FieldError>{errors.customerName}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="o-phone">Celular (WhatsApp)</Label>
            <input id="o-phone" inputMode="tel" className={controlClasses} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 98765-4321" />
            <FieldError>{errors.customerPhone}</FieldError>
          </div>
          <div>
            <Label htmlFor="o-email" optional>
              E-mail
            </Label>
            <input id="o-email" type="email" inputMode="email" className={controlClasses} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            <FieldError>{errors.customerEmail}</FieldError>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
          <span>O cliente aceita receber os avisos do pedido pelo WhatsApp.</span>
        </label>
      </Section>

      <Section title="Itens" help={itemsLocked ? "O pedido já saiu: os itens não mudam mais." : "Escolha do catálogo ou escreva um item avulso. O preço vem do catálogo quando já está confirmado."}>
        <ol className="space-y-3">
          {items.map((row, index) => {
            const product = products.find((p) => p.id === row.productId);
            return (
              <li key={row.key} className="rounded-xl border border-line bg-cloud p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                  <div>
                    <Label htmlFor={`o-item-${row.key}`}>Produto</Label>
                    <select
                      id={`o-item-${row.key}`}
                      className={controlClasses}
                      value={row.productId}
                      disabled={itemsLocked}
                      onChange={(e) => pickProduct(row, e.target.value)}
                    >
                      <option value="">Item avulso (escrever o nome)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {product?.variants.length ? (
                    <div>
                      <Label htmlFor={`o-variant-${row.key}`}>Variação</Label>
                      <select id={`o-variant-${row.key}`} className={controlClasses} value={row.variantId} disabled={itemsLocked} onChange={(e) => pickVariant(row, e.target.value)}>
                        {product.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : !row.productId ? (
                    <div>
                      <Label htmlFor={`o-name-${row.key}`}>Nome do item</Label>
                      <input id={`o-name-${row.key}`} className={controlClasses} value={row.name} disabled={itemsLocked} onChange={(e) => setItem(row.key, { name: e.target.value })} />
                      <FieldError>{errors[`items.${index}.name`]}</FieldError>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-24">
                    <Label htmlFor={`o-qty-${row.key}`}>Qtd.</Label>
                    <input
                      id={`o-qty-${row.key}`}
                      type="number"
                      min={1}
                      max={99}
                      inputMode="numeric"
                      className={controlClasses}
                      value={row.quantity}
                      disabled={itemsLocked}
                      onChange={(e) => setItem(row.key, { quantity: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                    />
                  </div>
                  <div className="w-36">
                    <Label htmlFor={`o-price-${row.key}`}>Preço unitário</Label>
                    <input
                      id={`o-price-${row.key}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      className={controlClasses}
                      value={row.price}
                      disabled={itemsLocked}
                      onChange={(e) => setItem(row.key, { price: e.target.value })}
                    />
                  </div>
                  {items.length > 1 && !itemsLocked ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}>
                      <TrashIcon className="h-4 w-4" /> Remover
                    </Button>
                  ) : null}
                </div>
                <FieldError>{errors[`items.${index}.unitPriceCents`]}</FieldError>
              </li>
            );
          })}
        </ol>
        <FieldError>{errors.items}</FieldError>
        {itemsLocked ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setItems((rows) => [...rows, { key: newKey(), productId: "", variantId: "", name: "", variantName: "", price: "", quantity: 1 }])}
          >
            <PlusIcon className="h-4 w-4" /> Adicionar item
          </Button>
        )}
      </Section>

      <Section title="Entrega">
        <fieldset>
          <legend className="text-sm font-semibold">Como o pedido chega ao cliente</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DELIVERY_METHODS.map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm has-[:checked]:border-deep-fjord has-[:checked]:bg-pale-blue">
                <input type="radio" name="o-delivery" checked={deliveryMethod === m} onChange={() => setDeliveryMethod(m)} />
                {DELIVERY_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
        {retirada ? (
          <p className="text-sm text-muted">O cliente retira na loja. Combine o dia pelo WhatsApp e marque “Cliente retirou” quando ele levar.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Label htmlFor="o-cep">CEP</Label>
                <input id="o-cep" inputMode="numeric" className={controlClasses} placeholder="00000-000" {...field("cep")} />
              </div>
              <Button type="button" variant="secondary" onClick={findCep} disabled={address.cep.replace(/\D/g, "").length !== 8}>
                Buscar endereço
              </Button>
              {cepStatus ? <p className="w-full text-sm text-muted" role="status">{cepStatus}</p> : null}
            </div>
            <FieldError>{errors["address.cep"]}</FieldError>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div>
                <Label htmlFor="o-rua">Rua</Label>
                <input id="o-rua" className={controlClasses} {...field("rua")} />
                <FieldError>{errors["address.rua"]}</FieldError>
              </div>
              <div>
                <Label htmlFor="o-numero">Número</Label>
                <input id="o-numero" className={controlClasses} {...field("numero")} />
                <FieldError>{errors["address.numero"]}</FieldError>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="o-complemento" optional>
                  Complemento
                </Label>
                <input id="o-complemento" className={controlClasses} placeholder="Apto, bloco" {...field("complemento")} />
              </div>
              <div>
                <Label htmlFor="o-bairro">Bairro</Label>
                <input id="o-bairro" className={controlClasses} {...field("bairro")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
              <div>
                <Label htmlFor="o-cidade">Cidade</Label>
                <input id="o-cidade" className={controlClasses} {...field("cidade")} />
                <FieldError>{errors["address.cidade"]}</FieldError>
              </div>
              <div>
                <Label htmlFor="o-uf">UF</Label>
                <input id="o-uf" maxLength={2} className={`${controlClasses} uppercase`} {...field("uf")} />
                <FieldError>{errors["address.uf"]}</FieldError>
              </div>
            </div>
            <div>
              <Label htmlFor="o-referencia" optional>
                Ponto de referência
              </Label>
              <input id="o-referencia" className={controlClasses} {...field("referencia")} />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="o-acesso" optional>
            Acesso para a entrega
          </Label>
          <textarea
            id="o-acesso"
            rows={2}
            className={controlClasses}
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="Andar, elevador ou escada, largura da porta, portaria, melhor horário"
          />
          <HelpText>Móveis grandes: saber disso antes evita volta com o produto.</HelpText>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={assembly} onChange={(e) => setAssembly(e.target.checked)} />
          <span>Inclui montagem</span>
        </label>
      </Section>

      <Section title="Valores e pagamento">
        <div className="grid gap-4 sm:grid-cols-2">
          {retirada ? null : (
            <div>
              <Label htmlFor="o-frete" optional>
                Frete
              </Label>
              <input id="o-frete" inputMode="decimal" placeholder="Vazio = a combinar" className={controlClasses} value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="o-desconto" optional>
              Desconto
            </Label>
            <input id="o-desconto" inputMode="decimal" placeholder="0,00" className={controlClasses} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="o-pagamento" optional>
              Forma de pagamento
            </Label>
            <select id="o-pagamento" className={controlClasses} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}>
              <option value="">Ainda não definida</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {orderId ? null : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            <span>O pagamento já foi confirmado</span>
          </label>
        )}
        <dl className="space-y-1 rounded-xl bg-cloud p-3 text-sm" aria-live="polite">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Itens</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Frete</dt>
            <dd>{shippingCents === null ? "A combinar" : formatPrice(shippingCents)}</dd>
          </div>
          {discountCents ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Desconto</dt>
              <dd>− {formatPrice(discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-line pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd>{total >= 0 ? formatPrice(total) : "Desconto maior que o pedido"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Observações internas" help="Só a equipe vê.">
        <textarea id="o-notas" aria-label="Observações internas" rows={3} className={controlClasses} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
      </Section>

      {message ? (
        <Notice tone={message === "Alterações salvas." ? "success" : "danger"} role="status">
          {message}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={saving} loadingLabel="Salvando…">
          {orderId ? "Salvar alterações" : "Registrar pedido"}
        </Button>
      </div>
    </form>
  );
}
