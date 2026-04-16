import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPage from "./Admin";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "admin@test.com" }, signOut: vi.fn(), isConfigured: true }),
}));
vi.mock("../../application/usecases/adminOperations", () => ({
  loadAdminData: vi.fn().mockResolvedValue({ configProfiles: [], algoVersions: [] }),
  createConfigProfile: vi.fn(),
  createAlgorithmVersion: vi.fn(),
}));
vi.mock("../../application/usecases/importPlanFromJson", () => ({ importPlanFromJsonText: vi.fn() }));
vi.mock("../../application/usecases/importPlanFromCsv", () => ({ importPlanFromCsvText: vi.fn() }));
vi.mock("../../application/usecases/importPlanFromExcel", () => ({ importPlanFromExcelArrayBuffer: vi.fn() }));
vi.mock("../../application/usecases/persistImportedPlan", () => ({ persistImportedPlanWithEngineContext: vi.fn() }));

function renderAdmin() {
  return render(<MemoryRouter><AdminPage /></MemoryRouter>);
}

describe("AdminPage", () => {
  it("renders control center heading", () => {
    renderAdmin();
    expect(screen.getAllByText(/centre de contr/i).length).toBeGreaterThan(0);
  });
});
