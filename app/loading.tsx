export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1160px] animate-pulse p-5"
      role="status"
      aria-label="Cargando Cantera"
    >
      <span className="sr-only">Cargando tu espacio de trabajo…</span>
      <div className="h-3 w-32 rounded bg-line" />
      <div className="mt-5 h-9 w-3/4 max-w-lg rounded bg-line" />
      <div className="mt-4 h-4 w-1/2 rounded bg-line" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-card border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="h-72 rounded-card border border-line bg-surface" />
        <div className="h-72 rounded-card border border-line bg-surface" />
      </div>
    </div>
  );
}
