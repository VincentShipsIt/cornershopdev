import { describe, expect, it } from "bun:test";

const signInForm = await Bun.file(
  new URL("../app/sign-in/sign-in-form.tsx", import.meta.url),
).text();

describe("magic-link sign-in form surface", () => {
  it("submits through the form handler instead of rendering a non-submit button", () => {
    expect(signInForm).toContain("<form onSubmit={submit}");
    expect(signInForm).toContain('<Button type="submit"');
  });
});
