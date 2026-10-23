import { act, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { lazySlot } from "../src/core/lazy-slot";

// D-101: a slot's code can load on demand; it shows the fallback, then the slot with its props.
describe("lazySlot", () => {
  it("renders the fallback, then the loaded slot with the props core passes", async () => {
    let resolve: (c: ComponentType<{ price: string }>) => void = () => {};
    const Card = lazySlot<{ price: string }>(() => new Promise((r) => (resolve = r)), <p data-testid="wait">…</p>);
    render(<Card price="Rp249.000" />);
    expect(screen.getByTestId("wait")).toBeTruthy();
    await act(async () => resolve(({ price }) => <p data-testid="card">{price}</p>));
    expect((await screen.findByTestId("card")).textContent).toBe("Rp249.000");
    expect(screen.queryByTestId("wait")).toBeNull();
  });
});
