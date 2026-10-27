import { FIRMNESS_LABELS, FIRMNESS_LEVELS, type Firmness } from "@/lib/catalog/types";

/**
 * Escala de firmeza de 5 níveis. O nível é informado em texto (não só por cor)
 * e a escala tem descrição acessível.
 */
export function FirmnessScale({
  value,
  compact = false,
  illustrative = false,
}: {
  value: Firmness;
  compact?: boolean;
  illustrative?: boolean;
}) {
  const index = FIRMNESS_LEVELS.indexOf(value);
  const label = FIRMNESS_LABELS[value];

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink">
        <span aria-hidden="true" className="flex gap-0.5">
          {FIRMNESS_LEVELS.map((level, i) => (
            <span key={level} className={`h-1.5 w-3 rounded-full ${i <= index ? "bg-air-blue" : "bg-line"}`} />
          ))}
        </span>
        <span>
          Firmeza: <strong className="font-semibold">{label}</strong>
        </span>
      </span>
    );
  }

  return (
    <figure className="rounded-2xl border border-line bg-white p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-deep-fjord">Firmeza</span>
        <span className="text-sm text-ink">
          <strong className="font-semibold">{label}</strong> — nível {index + 1} de {FIRMNESS_LEVELS.length}
          {illustrative ? <span className="text-muted"> (ilustrativo)</span> : null}
        </span>
      </figcaption>
      <div
        role="img"
        aria-label={`Escala de firmeza: ${label}, nível ${index + 1} de ${FIRMNESS_LEVELS.length}, de macio a firme.`}
        className="mt-3"
      >
        <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
          {FIRMNESS_LEVELS.map((level, i) => (
            <span
              key={level}
              className={`h-2.5 rounded-full ${i === index ? "bg-deep-fjord" : i < index ? "bg-air-blue/70" : "bg-pale-blue"}`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden="true">
          <span>Macio</span>
          <span>Médio</span>
          <span>Firme</span>
        </div>
      </div>
    </figure>
  );
}
