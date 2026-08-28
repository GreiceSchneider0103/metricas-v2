export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- export estatico, sem next/image
  return <img src="/logo-icon.png" alt="Go Metriks" className={`object-contain ${className}`} />;
}

export function Wordmark({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- export estatico, sem next/image
  return <img src="/wordmark.png" alt="Go Metriks" className={`h-8 w-auto object-contain ${className}`} />;
}
