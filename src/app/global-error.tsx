"use client";

// Shown when the root layout itself fails, so the message files may be
// unavailable. The three texts stay here on purpose.
const text = {
  title: "Ինչ-որ բան սխալ գնաց։ Что-то пошло не так. Something went wrong.",
  retry: "Կրկին փորձել · Повторить · Try again",
};

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="hy">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <p>{text.title}</p>
        <button type="button" onClick={() => reset()} style={{ minHeight: 48, padding: "0 16px" }}>
          {text.retry}
        </button>
      </body>
    </html>
  );
}
