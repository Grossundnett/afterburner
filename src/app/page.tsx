export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xs rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] tracking-[0.02em] text-text-muted">
          Weekly distance
        </p>
        <p className="mt-2 font-mono text-[36px] leading-none tabular-nums text-text">
          18.4<span className="text-text-muted"> km</span>
        </p>
      </div>
    </main>
  );
}
