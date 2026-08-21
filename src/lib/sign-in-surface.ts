import { FACTORY_BRAND, type BrandIdentity } from "@/lib/brand";
import type { VerticalMarketing } from "@/lib/verticals/types";

export type SignInCopy = VerticalMarketing["signIn"];

export type SignInSurface = {
  brand: BrandIdentity;
  copy: SignInCopy;
  inverse: boolean;
};

const factoryCopy: SignInCopy = {
  title: "Open your workspace.",
  description:
    "Manage the sites you own or operate. Enter the email connected to your Cornershopdev workspace—no password needed.",
  emailPlaceholder: "you@business.com",
  emptyPrompt: "New to Cornershopdev?",
  createLabel: "Build a local-business site",
  createHref: "/create",
};

/**
 * Authentication is shared infrastructure, but the hostname owns the product
 * language and visual shell. Unknown hosts fail closed to the factory.
 */
export function signInSurface(
  marketing: VerticalMarketing | null,
): SignInSurface {
  if (marketing) {
    return {
      brand: marketing.brand,
      copy: marketing.signIn,
      inverse: false,
    };
  }

  return {
    brand: FACTORY_BRAND,
    copy: factoryCopy,
    inverse: true,
  };
}

export function signInErrorMessage(error: string | string[] | undefined) {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;
  if (code === "INVALID_TOKEN" || code === "invalid-link") {
    return "That secure link is invalid, expired, or already used. Request a new one below.";
  }
  return "Sign-in could not be completed. Request a new secure link below.";
}
