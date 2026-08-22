import { redirect } from "next/navigation";

/**
 * Short public path for the restaurant theme gallery. The vertical-specific
 * route remains the source of truth; this alias keeps marketing CTAs short.
 */
export default function ThemesIndexPage() {
  redirect("/themes/restaurant");
}
