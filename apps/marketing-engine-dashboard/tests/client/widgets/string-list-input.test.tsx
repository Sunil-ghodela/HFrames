import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StringListInput } from "../../../src/client/slot-editor/widgets/string-list-input.tsx";

describe("StringListInput", () => {
  it("renders one input per item", () => {
    render(<StringListInput value={["a", "b"]} min={1} max={4} onChange={() => {}} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("disables remove when at min", () => {
    render(<StringListInput value={["a", "b"]} min={2} max={4} onChange={() => {}} />);
    const removes = screen.getAllByLabelText(/remove line/i) as HTMLButtonElement[];
    expect(removes.every((b) => b.disabled)).toBe(true);
  });

  it("disables add when at max", () => {
    render(<StringListInput value={["a", "b", "c", "d"]} min={1} max={4} onChange={() => {}} />);
    expect((screen.getByLabelText("add line") as HTMLButtonElement).disabled).toBe(true);
  });

  it("emits new array on add", () => {
    const onChange = vi.fn();
    render(<StringListInput value={["a", "b"]} min={1} max={4} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("add line"));
    expect(onChange).toHaveBeenCalledWith(["a", "b", ""]);
  });
});
