"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { useActionState, useState } from "react";
import { slugify } from "@/lib/format/slug";
import { createCafe, type CreateCafeState } from "./actions";

const initial: CreateCafeState = { error: null };

export function CreateCafeForm() {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState(createCafe, initial);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("cafeName")}</span>
        <input
          name="name"
          required
          maxLength={120}
          className={input}
          onChange={(e) => {
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("slug")}</span>
        <input
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9\-]{2,47}"
          className={input}
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
        <span className="text-staff-label2 text-[0.9375rem]">{t("slugHint")}</span>
      </label>
      {state.error && (
        <p
          role="alert"
          className="bg-pom-tint text-pomegranate m-0 flex items-start gap-2 rounded-xl px-3 py-2.5"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.error === "slug_taken" ? t("slugTaken") : t("error")}
        </p>
      )}
      <button type="submit" disabled={pending} className={button("primary", "mt-1")}>
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
