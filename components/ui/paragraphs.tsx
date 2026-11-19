/** Texto simples em parágrafos (sem HTML vindo do banco); linha em branco separa parágrafos. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink sm:text-base">
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}
