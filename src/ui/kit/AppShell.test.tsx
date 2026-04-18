import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("../../infra/offline/db", () => ({
  getQueueStats: vi.fn().mockResolvedValue({ pending: 0, applied: 0 }),
}));

vi.mock("../components/SyncDetailDrawer", () => ({
  SyncDetailDrawer: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Sync Status">
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}));

function renderShell(children = <div>content</div>) {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>
  );
}

describe("AppShell sync drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show sync drawer on initial render", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: "Sync Status" })).toBeNull();
  });

  it("opens sync drawer when sync badge is clicked", async () => {
    const { getQueueStats } = await import("../../infra/offline/db");
    (getQueueStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      pending: 3,
      applied: 5,
    });

    renderShell();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const badge = screen.getByLabelText(/opérations en attente de sync/i);
    fireEvent.click(badge);

    expect(screen.getByRole("dialog", { name: "Sync Status" })).toBeTruthy();
  });

  it("closes sync drawer when onClose is called", async () => {
    const { getQueueStats } = await import("../../infra/offline/db");
    (getQueueStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      pending: 2,
      applied: 0,
    });

    renderShell();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const badge = screen.getByLabelText(/opérations en attente de sync/i);
    fireEvent.click(badge);

    expect(screen.getByRole("dialog", { name: "Sync Status" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.queryByRole("dialog", { name: "Sync Status" })).toBeNull();
  });
});
