import { describe, expect, test } from "bun:test";
import { DeleteObjectsCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { deleteAndVerifyObjectVersions } from "@/lib/storage/versioned-cleanup";

describe("versioned S3 verification cleanup", () => {
  test("deletes exact versions and delete markers, then verifies absence", async () => {
    const versions = new Map([
      ["one.png", ["v2", "v1", "delete-marker"]],
      ["two.png", ["v1"]],
    ]);
    const deleted: Array<{ Key?: string; VersionId?: string }> = [];
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectVersionsCommand) {
          const key = command.input.Prefix!;
          const ids = versions.get(key) ?? [];
          return {
            Versions: ids
              .filter((id) => id !== "delete-marker")
              .map((VersionId) => ({ Key: key, VersionId })),
            DeleteMarkers: ids
              .filter((id) => id === "delete-marker")
              .map((VersionId) => ({ Key: key, VersionId })),
          };
        }
        if (command instanceof DeleteObjectsCommand) {
          for (const item of command.input.Delete?.Objects ?? []) {
            deleted.push(item);
            versions.set(
              item.Key!,
              (versions.get(item.Key!) ?? []).filter(
                (versionId) => versionId !== item.VersionId,
              ),
            );
          }
          return {};
        }
        throw new Error("Unexpected command");
      },
    };

    await expect(
      deleteAndVerifyObjectVersions({
        client: client as never,
        bucket: "versioned-assets",
        keys: ["one.png", "two.png"],
      }),
    ).resolves.toEqual({ deletedVersions: 4 });
    expect(deleted).toEqual([
      { Key: "one.png", VersionId: "v2" },
      { Key: "one.png", VersionId: "v1" },
      { Key: "one.png", VersionId: "delete-marker" },
      { Key: "two.png", VersionId: "v1" },
    ]);
  });

  test("fails closed when versions are undiscoverable or remain after deletion", async () => {
    const undiscoverable = { send: async () => ({}) };
    await expect(
      deleteAndVerifyObjectVersions({
        client: undiscoverable as never,
        bucket: "versioned-assets",
        keys: ["one.png"],
      }),
    ).rejects.toThrow("must expose an exact S3 version");

    let calls = 0;
    const sticky = {
      async send(command: unknown) {
        if (command instanceof ListObjectVersionsCommand) {
          calls += 1;
          return { Versions: [{ Key: "one.png", VersionId: `v${calls}` }] };
        }
        return {};
      },
    };
    await expect(
      deleteAndVerifyObjectVersions({
        client: sticky as never,
        bucket: "versioned-assets",
        keys: ["one.png"],
      }),
    ).rejects.toThrow("left object versions or delete markers behind");
  });
});
