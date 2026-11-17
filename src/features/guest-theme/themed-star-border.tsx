"use client";

import { useEffect, useRef, useState } from "react";
import { StarBorder, type StarBorderProps } from "./star-border";

// StarBorder for the guest pages' primary actions (cart bar, add to order,
// send to kitchen), in the café's theme: the button is the accent fill, the
// star and its trail come from the theme (CSS variables, which StarBorder
// resolves for its canvas), and the outline it draws follows the theme's
// pill radius (--guest-r-pill: 999 px, 15 px in Wine).
export function ThemedStarBorder(props: StarBorderProps) {
  const box = useRef<HTMLSpanElement>(null);
  const [radius, setRadius] = useState(999);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = parseFloat(getComputedStyle(el).getPropertyValue("--guest-r-pill"));
    if (Number.isFinite(r)) setRadius(r);
  }, []);
  return (
    <>
      <span ref={box} hidden />
      <StarBorder
        color="var(--guest-star)"
        trailColor="var(--guest-glow)"
        backgroundColor="var(--guest-accent)"
        textColor="var(--guest-on-accent)"
        borderColor="color-mix(in srgb, var(--guest-star) 45%, transparent)"
        radius={radius}
        glow={0.7}
        duration={5}
        {...props}
      />
    </>
  );
}
