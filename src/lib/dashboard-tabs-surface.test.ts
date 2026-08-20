import { describe, expect, it } from "bun:test";

const dashboard = await Bun.file(
  new URL("../app/dashboard/dashboard.tsx", import.meta.url),
).text();

describe("dashboard tab and settings surface", () => {
  it("uses one Base UI tab list containing the settings tab", () => {
    expect(dashboard.match(/<TabsList/g)).toHaveLength(1);
    expect(dashboard).toContain('["settings", Settings, "Settings"]');
    expect(dashboard).toContain('<TabsContent value="settings"');
  });

  it("associates the restaurant name label with its editor control", () => {
    expect(dashboard).toContain(
      '<Label htmlFor="restaurant-name">Restaurant name</Label>',
    );
    expect(dashboard).toContain('id="restaurant-name"');
  });
});
