import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotEditor } from "../../src/client/slot-editor/index.tsx";
import type { TemplateSchema } from "../../src/shared/types.ts";

const SCHEMA: TemplateSchema = {
  name: "shayari-reel",
  supportedAspects: ["9:16"],
  slots: {
    shayariLines: { type: "string[]", min: 2, max: 4, required: true, description: "lines" },
    festivalName: { type: "string", required: false, description: "" },
    accentColor: { type: "color", default: "@brand/craftlee-saffron", description: "" },
  },
};

describe("SlotEditor", () => {
  it("renders one input group per slot key", () => {
    render(<SlotEditor schema={SCHEMA} value={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/shayariLines/i)).toBeDefined();
    expect(screen.getByLabelText(/festivalName/i)).toBeDefined();
    expect(screen.getByLabelText(/accentColor/i)).toBeDefined();
  });
});
