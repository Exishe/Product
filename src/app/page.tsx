import { redirect } from "next/navigation";

// The root opens the Armenian guest landing until the public site exists.
export default function Home() {
  redirect("/hy");
}
