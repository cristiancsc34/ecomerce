"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { AssistantApiResponse, AssistantNextStep } from "@/lib/assistant/types";
import { ASSISTANT_MAX_CHARS, ASSISTANT_MAX_MESSAGES } from "@/lib/assistant/types";
import { ArIcon, ArrowUpIcon, ChatIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  products?: AssistantApiResponse["products"];
  nextStep?: AssistantNextStep;
};

const STORAGE_KEY = "cuxoes:assistente:v1";
const GREETING =
  "Oi! Sou o assistente da loja. Posso te ajudar a escolher a peça ideal e tirar dúvidas sobre os produtos. O que você procura?";
/** Atalhos de pergunta (vendedor consultivo). */
const SUGGESTIONS = ["Cabe na minha sala?", "Qual é melhor para leitura?", "Poltrona ou cadeira?", "Quanto custa?"];
const PRODUCT_SUGGESTIONS = ["Cabe na minha sala?", "Me conta mais sobre este produto", "Quais são as medidas?", "Quanto custa?"];

/** Produto da página aberta (/produtos/<slug>), para o assistente entender "essa", "ela". */
function productSlug(pathname: string | null): string | null {
  return pathname?.match(/^\/produtos\/([a-z0-9-]{1,100})$/)?.[1] ?? null;
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-ASSISTANT_MAX_MESSAGES) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-ASSISTANT_MAX_MESSAGES)));
  } catch {
    // Sem armazenamento (aba anônima): a conversa só não sobrevive à recarga.
  }
}

/** Histórico enviado à API: alternado, começando pelo cliente, dentro do limite. */
function apiHistory(messages: ChatMessage[]) {
  let list = messages.map(({ role, content }) => ({ role, content }));
  while (list.length > ASSISTANT_MAX_MESSAGES - 1 || (list.length && list[0].role !== "user")) list = list.slice(1);
  return list;
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportUrl, setSupportUrl] = useState("/atendimento");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const viewing = productSlug(usePathname());
  const suggestions = viewing ? PRODUCT_SUGGESTIONS : SUGGESTIONS;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading, open]);

  async function send(text: string) {
    const content = text.trim().slice(0, ASSISTANT_MAX_CHARS);
    if (!content || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    saveHistory(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiHistory(next), ...(viewing ? { pagina: { produto: viewing } } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Não consegui responder agora. Tente de novo.");
        return;
      }
      const reply = data as AssistantApiResponse;
      setSupportUrl(reply.supportUrl);
      const withReply: ChatMessage[] = [
        ...next,
        { role: "assistant", content: reply.answer, products: reply.products, nextStep: reply.nextStep },
      ];
      setMessages(withReply);
      saveHistory(withReply);
    } catch {
      setError("Sem conexão. Verifique sua internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setMessages([]);
    saveHistory([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            // A conversa da aba volta ao reabrir (sessionStorage).
            setMessages(loadHistory());
            setOpen(true);
          }}
          // No celular fica no canto; só sobe quando a página tem a barra fixa de compra (produto).
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 max-lg:[body:has([data-barra-fixa])_&]:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2 rounded-full bg-deep-fjord pl-4 pr-5 font-semibold text-white shadow-[var(--shadow-lift)] hover:bg-[#1d3a58] lg:bottom-6 lg:right-6"
        >
          <ChatIcon className="h-5 w-5" /> Ajuda
        </button>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] lg:pb-0 shadow-[0_-8px_32px_rgb(19_41_64/0.25)] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:h-[600px] lg:max-h-[calc(100dvh-3rem)] lg:w-[400px] lg:rounded-2xl"
        >
          <header className="flex items-center gap-3 bg-air-blue-ink px-4 py-3 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <ChatIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate font-semibold leading-tight text-white">
                Assistente da loja
              </h2>
              <p className="truncate text-xs text-white/80">Respostas com IA, só com dados da loja</p>
            </div>
            {messages.length ? (
              <button
                type="button"
                onClick={restart}
                title="Nova conversa"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
              >
                <PlusIcon className="h-5 w-5" />
                <span className="sr-only">Nova conversa</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
            >
              <CloseIcon className="h-5 w-5" />
              <span className="sr-only">Fechar assistente</span>
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-cloud px-3 py-4" aria-live="polite">
            <Bubble role="assistant">{GREETING}</Bubble>
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={m.role}>{m.content}</Bubble>
                {m.role === "assistant" && m.products?.length ? (
                  <ul className="space-y-2 pl-1" aria-label="Produtos sugeridos">
                    {m.products.map((p) => (
                      <ProductTile key={p.slug} product={p} onNavigate={() => setOpen(false)} />
                    ))}
                  </ul>
                ) : null}
                {m.role === "assistant" && m.nextStep === "falar_atendimento" && i === messages.length - 1 ? (
                  <a
                    href={supportUrl}
                    className="ml-1 inline-flex min-h-10 items-center rounded-full border border-deep-fjord/25 bg-white px-4 text-sm font-semibold text-deep-fjord hover:bg-pale-blue"
                    {...(supportUrl.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    Falar com o atendimento
                  </a>
                ) : null}
              </div>
            ))}
            {loading ? (
              <p className="w-fit rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-muted shadow-[var(--shadow-soft)]">
                Digitando…
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="rounded-lg bg-white px-4 py-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
            {!messages.length && !loading ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-air-blue-ink/40 bg-white px-3 py-2 text-sm font-medium text-air-blue-ink hover:bg-pale-blue"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="assistente-mensagem" className="sr-only">
                Sua mensagem
              </label>
              <textarea
                id="assistente-mensagem"
                ref={inputRef}
                value={input}
                rows={1}
                maxLength={ASSISTANT_MAX_CHARS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Escreva sua pergunta"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-line bg-cloud px-3 py-2.5 text-base text-ink placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-deep-fjord text-white disabled:opacity-50"
              >
                <ArrowUpIcon className="h-5 w-5" />
                <span className="sr-only">Enviar</span>
              </button>
            </div>
            <p className="mt-2 text-[0.6875rem] leading-snug text-muted">
              Assistente com IA: pode errar, confira na página do produto. Não envie CPF, cartão ou senhas.
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <p
      className={`w-fit max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed ${
        mine
          ? "ml-auto rounded-br-md bg-deep-fjord text-white"
          : "rounded-bl-md bg-white text-ink shadow-[var(--shadow-soft)]"
      }`}
    >
      <span className="sr-only">{mine ? "Você: " : "Assistente: "}</span>
      {children}
    </p>
  );
}

/**
 * Cartão de produto sugerido: o cartão inteiro abre a página do produto; o botão
 * "Ver no seu ambiente" abre a página pronta para o AR (no computador, o código QR).
 * Foto, nome e preço vêm do catálogo (montados no servidor), nunca do modelo.
 */
function ProductTile({ product, onNavigate }: { product: AssistantApiResponse["products"][number]; onNavigate: () => void }) {
  return (
    <li className="relative flex max-w-[92%] gap-3 rounded-xl bg-white p-2 shadow-[var(--shadow-soft)] has-[a:hover]:ring-1 has-[a:hover]:ring-air-blue-ink/40">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-pale-blue">
        {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={product.url}
          onClick={onNavigate}
          className="text-sm font-semibold text-ink after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-air-blue"
        >
          {product.name}
        </Link>
        <p className="text-sm font-bold text-air-blue-ink">{product.priceText ?? "Preço em breve"}</p>
        {product.reason ? <p className="mt-0.5 text-xs leading-snug text-muted">{product.reason}</p> : null}
        {product.has3d ? (
          <Link
            href={`${product.url}?ar=1`}
            onClick={onNavigate}
            aria-label={`Ver no seu ambiente: ${product.name}`}
            className="relative z-10 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-deep-fjord px-3.5 text-xs font-semibold text-white hover:bg-[#1d3a58] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-air-blue"
          >
            <ArIcon className="h-4 w-4" /> Ver no seu ambiente
          </Link>
        ) : null}
      </div>
    </li>
  );
}
