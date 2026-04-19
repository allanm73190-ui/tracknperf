import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccessDeniedPage from "./AccessDenied";

function renderAccessDenied() {
  return render(<MemoryRouter><AccessDeniedPage /></MemoryRouter>);
}

describe("AccessDeniedPage", () => {
  it("renders access denied heading", () => {
    renderAccessDenied();
    expect(screen.getByText(/accès/i)).toBeInTheDocument();
    expect(screen.getByText(/refusé/i)).toBeInTheDocument();
  });
});
