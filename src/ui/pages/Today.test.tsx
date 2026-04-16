import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TodayPage from "./Today";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" }, signOut: vi.fn(), isConfigured: true }),
}));
vi.mock("../../application/usecases/getTodayOverview", () => ({
  getTodayOverview: vi.fn().mockResolvedValue({ planned: [], executed: [] }),
}));
vi.mock("../../application/usecases/computeAndPersistTodayRecommendation", () => ({
  computeAndPersistTodayRecommendation: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../application/sync/syncClient", () => ({
  flushSyncQueue: vi.fn().mockResolvedValue({ applied: 0, failed: 0 }),
}));
vi.mock("../../infra/offline/db", () => ({
  getQueueStats: vi.fn().mockResolvedValue({ pending: 3, applied: 12 }),
  listRecentOps: vi.fn().mockResolvedValue([
    { opId: "op1", entity: "session", opType: "upsert", status: "pending", attempts: 0, nextAttemptAt: null, lastError: null },
    { opId: "op2", entity: "profile", opType: "upsert", status: "applied", attempts: 1, nextAttemptAt: null, lastError: null },
  ]),
}));

async function openSyncDrawer() {
  // Wait for syncStatus to load (pill shows "Queued 3"), then open drawer
  await screen.findAllByText(/queued 3/i);
  const syncBtns = screen.getAllByRole("button", { name: /^sync$/i });
  fireEvent.click(syncBtns[0]);
}

function renderToday() {
  return render(<MemoryRouter><TodayPage /></MemoryRouter>);
}

describe("TodayPage sync drawer", () => {
  it("shows FORCE SYNCHRONIZATION button when sync drawer is open", async () => {
    renderToday();
    await openSyncDrawer();
    expect(await screen.findByText(/force synchronization/i)).toBeInTheDocument();
  });

  it("shows EN ATTENTE and APPLIQUÉS labels in sync drawer", async () => {
    renderToday();
    await openSyncDrawer();
    expect((await screen.findAllByText(/en attente/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/appliqu/i)).length).toBeGreaterThan(0);
  });

  it("shows Sync Details heading in sync drawer", async () => {
    renderToday();
    await openSyncDrawer();
    expect((await screen.findAllByText(/sync details/i)).length).toBeGreaterThan(0);
  });
});
