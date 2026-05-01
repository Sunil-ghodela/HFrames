import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetInput } from "../../../src/client/slot-editor/widgets/asset-input.tsx";
import type { AssetEntry } from "../../../src/shared/types.ts";

const SAMPLE: AssetEntry = {
  name: "sample-bg.png",
  relPath: "sample-bg.png",
  absPath: "/dev/null",
  kind: "image",
};

describe("AssetInput", () => {
  it("renders thumbnails for image assets", () => {
    render(
      <AssetInput kind="image" value="" assets={[SAMPLE]} brandTokens={[]} onChange={() => {}} />,
    );
    expect(screen.getByRole("img", { name: "sample-bg.png" })).toBeDefined();
  });

  it("emits @asset/<name> on click", () => {
    const onChange = vi.fn();
    render(
      <AssetInput kind="image" value="" assets={[SAMPLE]} brandTokens={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("img", { name: "sample-bg.png" }));
    expect(onChange).toHaveBeenCalledWith("@asset/sample-bg.png");
  });
});
