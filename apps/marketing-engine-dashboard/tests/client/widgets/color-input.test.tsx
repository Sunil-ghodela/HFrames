import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorInput } from "../../../src/client/slot-editor/widgets/color-input.tsx";

describe("ColorInput", () => {
  it("renders a native color picker for hex value", () => {
    render(<ColorInput value="#FF9933" brandSwatches={{}} onChange={() => {}} />);
    expect((screen.getByLabelText("color picker") as HTMLInputElement).value).toBe("#ff9933");
  });

  it("preserves @brand/ token through swatch click and emits onChange", () => {
    const onChange = vi.fn();
    render(
      <ColorInput
        value="#FF9933"
        brandSwatches={{ saffron: { hex: "#FF9933", token: "@brand/craftlee-saffron" } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("brand swatch saffron"));
    expect(onChange).toHaveBeenCalledWith("@brand/craftlee-saffron");
  });

  it("emits the typed hex when user changes the picker", () => {
    const onChange = vi.fn();
    render(<ColorInput value="#FF9933" brandSwatches={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("color picker"), { target: { value: "#000000" } });
    expect(onChange).toHaveBeenCalledWith("#000000");
  });
});
