import { ChevronDownIcon } from "./icons";

/** Lista de perguntas com <details>: acessível por teclado e funciona sem JavaScript. */
export function FaqList({ items, headingLevel = "h3" }: { items: { question: string; answer: string }[]; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-white">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left hover:bg-cloud [&::-webkit-details-marker]:hidden">
            <Heading className="text-base font-semibold text-deep-fjord">{item.question}</Heading>
            <ChevronDownIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-5 pb-5 text-ink">
            {item.answer.split("\n").filter(Boolean).map((p, i) => (
              <p key={i} className={i ? "mt-3" : undefined}>
                {p}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
