import { describe, expect, it } from "vitest";
import { CHECKPOINT_TAG_COLORS, nextCheckpointTagColor } from "./checkpoint-tag-colors";

describe("nextCheckpointTagColor", () => {
  it("começa pela primeira cor", () => {
    expect(nextCheckpointTagColor([])).toBe("sky");
  });

  it("pula as cores já usadas pelo item", () => {
    expect(nextCheckpointTagColor(["sky", "peach"])).toBe("sage");
  });

  it("com todas usadas, recomeça o ciclo", () => {
    const todas = [...CHECKPOINT_TAG_COLORS];
    expect(nextCheckpointTagColor(todas)).toBe("sky");
    expect(nextCheckpointTagColor([...todas, "sky"])).toBe("sage");
  });
});
