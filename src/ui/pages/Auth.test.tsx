import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthPage from "./Auth";

vi.mock("../../auth/authActions", () => ({
  authSignIn: vi.fn(),
  authSignInWithOtp: vi.fn(),
  authSignUp: vi.fn(),
  isSupabaseConfigured: () => true,
}));

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>
  );
}

describe("AuthPage", () => {
  it("renders brand name", () => {
    renderAuth();
    expect(screen.getByText(/TRACK'N'PERF/i)).toBeInTheDocument();
  });

  it("renders email input", () => {
    renderAuth();
    expect(screen.getByLabelText(/adresse email/i)).toBeInTheDocument();
  });

  it("renders mode tabs", () => {
    renderAuth();
    expect(screen.getAllByRole("button", { name: /connexion/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /inscription/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /lien magique/i }).length).toBeGreaterThan(0);
  });

  it("renders submit CTA", () => {
    renderAuth();
    expect(screen.getAllByRole("button", { name: /envoyer le lien/i }).length).toBeGreaterThan(0);
  });
});
