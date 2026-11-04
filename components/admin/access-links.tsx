"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { criarLinkDeAcessoAction, revogarLinkDeAcessoAction } from "@/lib/admin/actions/access-links";
import type { LinkDeAcesso, Validade } from "@/lib/admin/access-links";
import { AREAS, DESCRICAO_AREA, ROTULO_AREA, type AreaDoPainel } from "@/lib/auth/areas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses, Field } from "@/components/ui/field";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Card } from "./ui";

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmt = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : null);

const VALIDADES: { valor: Validade; rotulo: string }[] = [
  { valor: "7", rotulo: "7 dias" },
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "sem", rotulo: "Sem prazo (até revogar)" },
];

const SITUACAO = {
  ativo: { label: "ativo", tone: "success" },
  revogado: { label: "revogado", tone: "neutral" },
  vencido: { label: "vencido", tone: "warm" },
} as const;

/** Tela /admin/acessos: criar links por área, copiar (uma vez) e revogar. */
export function AccessLinksManager({ links }: { links: LinkDeAcesso[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [areas, setAreas] = useState<AreaDoPainel[]>([]);
  const [validade, setValidade] = useState<Validade>("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState<{ url: string; label: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const alternar = (a: AreaDoPainel) => setAreas((atual) => (atual.includes(a) ? atual.filter((x) => x !== a) : [...atual, a]));

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setCopiado(false);
    const r = await criarLinkDeAcessoAction({ label, areas, validade });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    setNovo({ url: r.data.url, label });
    setLabel("");
    setAreas([]);
    router.refresh();
  }

  async function copiar() {
    if (!novo) return;
    try {
      await navigator.clipboard.writeText(novo.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function revogar(id: string) {
    setRevogando(id);
    setError(null);
    const r = await revogarLinkDeAcessoAction(id);
    setRevogando(null);
    setConfirmar(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const ativos = links.filter((l) => l.situacao === "ativo");
  const outros = links.filter((l) => l.situacao !== "ativo");

  return (
    <div className="space-y-6">
      <Card title="Novo link de acesso" description="Quem abrir o link entra só nas áreas marcadas. Você pode revogar quando quiser.">
        <form onSubmit={criar} className="space-y-4" noValidate>
          <Field id="link-label" label="Para quem é" help='Ex.: "Depósito do João" ou "Atendimento da Ana".' error={fieldErrors.label}>
            <input
              id="link-label"
              className={controlClasses}
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={fieldErrors.label ? true : undefined}
            />
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-ink">Áreas que o link abre</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {AREAS.map((a) => (
                <label
                  key={a}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${areas.includes(a) ? "border-deep-fjord bg-pale-blue" : "border-line bg-white"}`}
                >
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={areas.includes(a)} onChange={() => alternar(a)} />
                  <span>
                    <span className="block font-semibold text-deep-fjord">{ROTULO_AREA[a]}</span>
                    <span className="block text-sm text-muted">{DESCRICAO_AREA[a]}</span>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.areas ? <p className="mt-1.5 text-sm text-danger">{fieldErrors.areas}</p> : null}
          </fieldset>
          <Field id="link-validade" label="Vale por">
            <select id="link-validade" className={controlClasses} value={validade} onChange={(e) => setValidade(e.target.value as Validade)}>
              {VALIDADES.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </Field>
          {error ? <Notice tone="danger" role="alert" title={error} /> : null}
          <Button type="submit" loading={busy} loadingLabel="Criando…">
            Criar link
          </Button>
        </form>

        {novo ? (
          <div className="mt-5 space-y-3 rounded-xl border border-linen bg-linen/40 p-4" role="status" aria-live="polite">
            <p className="font-semibold text-ink">Link de &quot;{novo.label}&quot; pronto. Copie agora: ele não aparece de novo.</p>
            <p className="break-all rounded-lg bg-white p-3 font-mono text-sm" data-testid="link-novo">
              {novo.url}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copiar}>
                {copiado ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar link"}
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao painel: ${novo.url}`)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-deep-fjord hover:bg-pale-blue"
              >
                Mandar pelo WhatsApp
              </a>
            </div>
            <p className="text-sm text-muted">Quem tiver o link entra. Se ele vazar, revogue aqui e crie outro.</p>
          </div>
        ) : null}
      </Card>

      <Card title="Links ativos" description="Revogar tira o acesso na hora: o link para de abrir e quem entrou por ele sai na próxima tela.">
        {ativos.length ? (
          <ul className="divide-y divide-line" data-testid="links-ativos">
            {ativos.map((l) => (
              <LinhaDoLink
                key={l.id}
                link={l}
                acao={
                  confirmar === l.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">Revogar este link?</span>
                      <Button type="button" variant="danger" size="sm" loading={revogando === l.id} loadingLabel="Revogando…" onClick={() => revogar(l.id)}>
                        Sim, revogar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmar(null)}>
                        Cancelar
                      </Button>
                    </span>
                  ) : (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmar(l.id)}>
                      Revogar
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum link ativo. Só a administração geral entra no painel.</p>
        )}
      </Card>

      {outros.length ? (
        <Card title="Revogados e vencidos">
          <ul className="divide-y divide-line">
            {outros.map((l) => (
              <LinhaDoLink key={l.id} link={l} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function LinhaDoLink({ link: l, acao }: { link: LinkDeAcesso; acao?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-deep-fjord">
          {l.label} <Badge tone={SITUACAO[l.situacao].tone}>{SITUACAO[l.situacao].label}</Badge>
        </p>
        <p className="text-sm">{l.areas.map((a) => ROTULO_AREA[a]).join(", ")}</p>
        <p className="text-xs text-muted">
          Criado em {fmt(l.createdAt)}
          {l.expiresAt ? ` · ${l.situacao === "vencido" ? "venceu" : "vale até"} ${fmt(l.expiresAt)}` : " · sem prazo"}
          {l.revokedAt ? ` · revogado em ${fmt(l.revokedAt)}` : ""}
          {l.lastUsedAt ? ` · último uso ${fmt(l.lastUsedAt)} (${l.useCount}×)` : " · ainda não usado"}
        </p>
      </div>
      {acao ?? null}
    </li>
  );
}
