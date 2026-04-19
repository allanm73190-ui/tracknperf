import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OnboardingPage from "./Onboarding";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" }, signOut: vi.fn(), isConfigured: true }),
}));
vi.mock("../../application/usecases/saveProfile", () => ({
  saveProfile: vi.fn(),
}));

function renderOnboarding() {
  return render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
}

describe("OnboardingPage", () => {
  it("renders brand name", () => {
    renderOnboarding();
    expect(screen.getByText(/track.n.perf/i)).toBeInTheDocument();
  });
});
