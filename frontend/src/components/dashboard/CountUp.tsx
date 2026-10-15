import { useCountUp } from "@/hooks/useCountUp";

/** A number that counts up on first show. Screen readers get the final value only. */
export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const animated = useCountUp(value);
  return (
    <span className={className}>
      <span aria-hidden>{format(animated)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
