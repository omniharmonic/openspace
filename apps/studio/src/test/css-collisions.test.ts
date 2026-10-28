import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? cssFiles(join(dir, e.name))
      : e.name.endsWith(".css")
        ? [join(dir, e.name)]
        : [],
  );
}

/** Block classes (`.st-name`, no `__element` or `--modifier`) that open a rule at the top level. */
function topLevelBlocks(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/^\.(st-[a-z0-9]+(?:-[a-z0-9]+)*) \{/gm)].map((m) => m[1] as string),
  );
}

describe("Studio's CSS", () => {
  // Every stylesheet is global once loaded, so a block class defined in two files restyles the
  // other screen as soon as both have been visited (the templates gallery once took the media
  // picker's 150px grid).
  it("defines each block class in one stylesheet only", () => {
    const owners = new Map<string, string[]>();
    for (const file of cssFiles(src))
      for (const block of topLevelBlocks(readFileSync(file, "utf8")))
        owners.set(block, [...(owners.get(block) ?? []), relative(src, file)]);
    const shared = [...owners]
      .filter(([, files]) => files.length > 1)
      .map(([b, f]) => `${b}: ${f.join(", ")}`);
    expect(shared).toEqual([]);
  });
});
