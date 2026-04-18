import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPage from "./Admin";
import type { PlanImport } from "../../domain/plan/planImport";

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

const mockParsed: PlanImport = {
  plan: { name: "Mon Programme", description: null },
  planVersion: { version: 1, payload: {} },
  sessionTemplates: [
    { name: "Force", template: { source: "legacy", items: [{}, {}, {}] } },
    { name: "Hypertrophie", template: { source: "legacy", items: [{}, {}] } },
  ],
  plannedSessions: [],
};

describe("AdminPage", () => {
  it("renders control center heading", () => {
    renderAdmin();
    expect(screen.getAllByText(/centre de contr/i).length).toBeGreaterThan(0);
  });

  it("shows import tab by default", () => {
    renderAdmin();
    expect(screen.getByText(/fichier de plan/i)).toBeInTheDocument();
  });

  it("shows template names and exercise counts in preview", async () => {
    const mod = await import("../../application/usecases/importPlanFromExcel");
    vi.mocked(mod.importPlanFromExcelArrayBuffer).mockReturnValueOnce(mockParsed);

    renderAdmin();

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const fakeFile = new File(["content"], "programme.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(fakeFile, "arrayBuffer", {
      value: () => Promise.resolve(new ArrayBuffer(0)),
      configurable: true,
    });
    const fileList = {
      0: fakeFile,
      length: 1,
      item: (i: number) => (i === 0 ? fakeFile : null),
    };
    fireEvent.change(fileInput, { target: { files: fileList } });

    fireEvent.click(screen.getByRole("button", { name: /parser/i }));

    await screen.findByText("Force");
    await screen.findByText("Hypertrophie");
    await screen.findByText(/3 exercices/i);
    await screen.findByText(/2 exercices/i);
  });
});
