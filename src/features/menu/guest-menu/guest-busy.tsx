// The guest page when the database cannot answer (ADR-089): the default guest
// theme, a short message, a link that reloads the same page, and an automatic
// reload after a few seconds. Server-rendered, no script.
export const GUEST_BUSY_RELOAD_SECONDS = 5;

export function GuestBusy({ title, body, retry }: { title: string; body: string; retry: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[30rem] flex-col justify-center gap-2 px-6 py-12">
      <meta httpEquiv="refresh" content={String(GUEST_BUSY_RELOAD_SECONDS)} />
      <h1 className="display-face text-title m-0 text-[1.375rem] leading-[1.2] text-balance">{title}</h1>
      <p role="status" className="text-muted m-0 text-[14px] leading-[1.45]">
        {body}
      </p>
      <a
        href=""
        className="bg-accent text-on-accent rounded-guest-md mt-4 inline-flex min-h-11 items-center self-start px-5 text-[14px] font-semibold no-underline focus-visible:outline-3 focus-visible:outline-offset-2"
      >
        {retry}
      </a>
    </main>
  );
}
