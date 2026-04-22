import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TodayPage from "./Today";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" }, signOut: vi.fn(), isConfigured: true }),
}));
vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ loading: false, role: "athlete", error: null }),
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
vi.mock("../../application/usecases/notifications", () => ({
  listInAppNotifications: vi.fn().mockResolvedValue([]),
  markNotificationAsRead: vi.fn().mockResolvedValue(undefined),
}));

async function openSyncDrawer() {
  // Wait for syncStatus pill to appear ("En attente 3"), then open sync drawer
  await screen.findAllByText(/en attente 3/i);
  const syncBtns = screen.getAllByRole("button", { name: /^sync$/i });
  fireEvent.click(syncBtns[0]!);
}

function renderToday() {
  return render(<MemoryRouter><TodayPage /></MemoryRouter>);
}

describe("TodayPage sync drawer", () => {
  it("shows FORCER LA SYNCHRO button when sync drawer is open", async () => {
    renderToday();
    await openSyncDrawer();
    expect(await screen.findByText(/forcer la synchro/i)).toBeInTheDocument();
  });

  it("shows EN ATTENTE and APPLIQUÉS labels in sync drawer", async () => {
    renderToday();
    await openSyncDrawer();
    expect((await screen.findAllByText(/en attente/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/appliqu/i)).length).toBeGreaterThan(0);
  });

  it("shows Détails de sync heading in sync drawer", async () => {
    renderToday();
    await openSyncDrawer();
    expect((await screen.findAllByText(/détails de sync/i)).length).toBeGreaterThan(0);
  });
});
