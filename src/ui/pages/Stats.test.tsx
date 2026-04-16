import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatsPage from "./Stats";

vi.mock("../../application/usecases/getExecutedSessions", () => ({
  getExecutedSessionStats: vi.fn().mockResolvedValue({ executedCount: 5, totalDurationMinutes: 120 }),
}));

function renderStats() {
  return render(<MemoryRouter><StatsPage /></MemoryRouter>);
}

describe("StatsPage", () => {
  it("renders performance heading", () => {
    renderStats();
    expect(screen.getByText(/performance globale/i)).toBeInTheDocument();
  });
});
