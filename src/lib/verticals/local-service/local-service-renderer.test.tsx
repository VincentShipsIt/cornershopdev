import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportStudio } from "@/app/create/import-studio";
import { SiteRenderer } from "@/components/site-renderer";
import { FACTORY_BRAND } from "@/lib/brand";
import { Vertical } from "@/generated/prisma/enums";
import { sampleLocalServiceSiteDraft } from "@/lib/verticals/local-service/fixtures";

describe("local-service surfaces", () => {
  it("renders trade facts and contact conversion without a restaurant request form", () => {
    const html = renderToStaticMarkup(
      <SiteRenderer
        draft={sampleLocalServiceSiteDraft}
        vertical={Vertical.LOCAL_SERVICE}
      />,
    );

    expect(html).toContain("Request a written quote");
    expect(html).toContain("Message on WhatsApp");
    expect(html).toContain("Service areas");
    expect(html).toContain("Credentials and cover");
    expect(html).toContain("Townhouse rewire");
    expect(html).not.toContain("Number of people");
    expect(html).not.toContain("Request a table");
  });

  it("keeps the create action as a real form submit button", () => {
    const html = renderToStaticMarkup(
      <ImportStudio
        initialSource=""
        initialVertical={Vertical.LOCAL_SERVICE}
        initialBrand={{
          ...FACTORY_BRAND,
          vertical: null,
          homeUrl: "https://cornershop.dev",
        }}
      />,
    );

    expect(html).toContain("Local trade");
    expect(html).toContain('type="submit"');
    expect(html).toContain("trade website or business name");
  });
});
