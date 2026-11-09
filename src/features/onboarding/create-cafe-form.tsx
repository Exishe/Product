"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { slugify } from "@/lib/format/slug";
import { createCafe, type CreateCafeState } from "./actions";

const initial: CreateCafeState = { error: null };
const field = "h-12 rounded-input border border-line-strong bg-white px-3";

export function CreateCafeForm() {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState(createCafe, initial);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("cafeName")}</span>
        <input
          name="name"
          required
          maxLength={120}
          className={field}
          onChange={(e) => {
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">{t("slug")}</span>
        <input
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9\-]{2,47}"
          className={field}
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
        <span className="text-sm text-muted">{t("slugHint")}</span>
      </label>
      {state.error && (
        <p role="alert" className="rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
          {state.error === "slug_taken" ? t("slugTaken") : t("error")}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-input bg-tarragon font-semibold text-white disabled:opacity-60">
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
