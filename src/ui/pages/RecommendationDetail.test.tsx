import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RecommendationDetailPage from "./RecommendationDetail";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/recommendation/1"]}>
      <Routes>
        <Route path="/recommendation/:id" element={<RecommendationDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RecommendationDetailPage", () => {
  it("renders analyse IA heading", () => {
    renderPage();
    expect(screen.getByText(/analyse ia/i)).toBeInTheDocument();
  });
});
