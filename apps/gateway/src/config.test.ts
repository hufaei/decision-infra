import { describe, expect, test } from "vitest";

import { createRegistry } from "./config.js";

describe("gateway provider configuration", () => {
  test("registers the selected four model ids without loading local weights", () => {
    const registry = createRegistry({
      TYPESAFE_API_KEY: "test-key",
      REFLEX_BASE_URL: "http://reflex:8000/v1/systemone",
      SEMIF_BASE_URL: "http://semif:8000/v1/systemone",
    });

    expect(registry.get().id).toBe("jev-latest");
    expect(registry.get("reflex-qwen3.5-4b").id).toBe("reflex-qwen3.5-4b");
    expect(registry.get("semif-qwen3.5-4b").id).toBe("semif-qwen3.5-4b");
    expect(registry.get("laya-multilingual").id).toBe("laya-multilingual");
  });

  test("treats an empty default override as unset", () => {
    expect(createRegistry({ DECISION_DEFAULT_MODEL: "" }).get().id).toBe(
      "laya-multilingual",
    );
  });
});
