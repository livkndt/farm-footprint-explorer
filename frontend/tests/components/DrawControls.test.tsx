import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import DrawControls from "../../app/components/DrawControls";

const noop = vi.fn();

describe("DrawControls", () => {
  it("renders pin and polygon buttons", () => {
    render(
      <DrawControls mode={null} onModeChange={noop} onClear={noop} geometry={null} />
    );
    expect(screen.getByRole("button", { name: /drop pin/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /draw polygon/i })).toBeInTheDocument();
  });

  it("clicking pin button calls onModeChange with pin", async () => {
    const onModeChange = vi.fn();
    render(
      <DrawControls mode={null} onModeChange={onModeChange} onClear={noop} geometry={null} />
    );
    await userEvent.click(screen.getByRole("button", { name: /drop pin/i }));
    expect(onModeChange).toHaveBeenCalledWith("pin");
  });

  it("clicking polygon button calls onModeChange with polygon", async () => {
    const onModeChange = vi.fn();
    render(
      <DrawControls mode={null} onModeChange={onModeChange} onClear={noop} geometry={null} />
    );
    await userEvent.click(screen.getByRole("button", { name: /draw polygon/i }));
    expect(onModeChange).toHaveBeenCalledWith("polygon");
  });

  it("active mode button has active styling", () => {
    render(
      <DrawControls mode="pin" onModeChange={noop} onClear={noop} geometry={null} />
    );
    const pinBtn = screen.getByRole("button", { name: /drop pin/i });
    expect(pinBtn).toHaveAttribute("data-active", "true");
  });

  it("clear button is hidden when geometry is null", () => {
    render(
      <DrawControls mode={null} onModeChange={noop} onClear={noop} geometry={null} />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("clear button is visible when geometry is set", () => {
    const geometry = { type: "Point" as const, coordinates: [0, 0] as [number, number] };
    render(
      <DrawControls mode="pin" onModeChange={noop} onClear={noop} geometry={geometry} />
    );
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});
