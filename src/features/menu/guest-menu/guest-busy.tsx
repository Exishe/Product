// The guest page when the database cannot answer (ADR-089): the default guest
// theme, a short message, a link that reloads the same page, and an automatic
// reload after a few seconds. Server-rendered, no script.
export const GUEST_BUSY_RELOAD_SECONDS = 5;

export function GuestBusy({ title, body, retry }: { title: string; body: string; retry: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center gap-3 px-6 py-12">
      <meta httpEquiv="refresh" content={String(GUEST_BUSY_RELOAD_SECONDS)} />
      <h1 className="text-ink m-0 font-serif text-4xl leading-tight text-balance">{title}</h1>
      <p role="status" className="text-muted m-0 text-xl">
        {body}
      </p>
      <a
        href=""
        className="bg-accent text-on-accent mt-4 self-start rounded-full px-5 py-3 font-semibold no-underline focus-visible:outline-3 focus-visible:outline-offset-2"
      >
        {retry}
      </a>
    </main>
  );
}
