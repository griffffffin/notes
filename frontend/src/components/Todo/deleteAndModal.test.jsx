import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import DeleteAndModal from "./deleteAndModal";

/* A jsdom nem implementálja a <dialog> showModal()/close() metódusait — a
   megerősítő modál ezekre épül —, ezért a prototípuson pótoljuk (mint a
   modal.test.jsx). Csak az `open` állítását modellezzük; a natív top-layer a
   böngészőé, a teszt a törlés-LOGIKÁT vizsgálja. */
beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; });
});

// Állandó handleAxios (a komponens nem függ tőle effektben, de a mock stabil legyen).
const {handleAxios} = vi.hoisted(() => ({handleAxios: vi.fn()}));
vi.mock("../../contexts/auth-context", () => ({useAuth: () => ({handleAxios})}));

/* A DeleteAndModal a szerkesztőben él; a törlés utáni navigációt egy valódi
   route-táblával figyeljük: a /to-do route egy jelző-szöveget render. */
const renderDelete = () => render(
    <MemoryRouter initialEntries={["/to-do/update/todo-9"]}>
        <Routes>
            <Route path="/to-do/update/:id" element={
                <DeleteAndModal todoId="todo-9" color="warning" handleLinkClicked={vi.fn()}
                                setIsCategoryClicked={vi.fn()} setIsColorClicked={vi.fn()}
                                handleCategoryChange={vi.fn()}/>}/>
            <Route path="/to-do" element={<div>FŐLISTA</div>}/>
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        then({status: 200});
        return Promise.resolve();
    });
});

describe("Törlés folyamata", () => {
    it("megerősítés után a /to-do/delete-et hívja az id-val, majd a listára navigál", async () => {
        renderDelete();

        // A kártya Törlés gombja (az első ilyen) megnyitja a megerősítő modált.
        await userEvent.click(screen.getAllByRole("button", {name: "Törlés"})[0]);
        // A modálon belüli Törlés erősíti meg a műveletet.
        const modalBody = document.querySelector(".modal-body");
        await userEvent.click(within(modalBody).getByRole("button", {name: "Törlés"}));

        expect(handleAxios).toHaveBeenCalledWith("/to-do/delete", {id: "todo-9"},
            expect.any(Function), expect.any(Function));
        // A sikeres törlés a to-do listára visz.
        await waitFor(() => expect(screen.getByText("FŐLISTA")).toBeInTheDocument());
    });

    it("a Vissza gomb megszakítja: nem töröl és nem navigál", async () => {
        renderDelete();

        await userEvent.click(screen.getAllByRole("button", {name: "Törlés"})[0]);
        // A modálon belüli Vissza elveti a törlést.
        const modalBody = document.querySelector(".modal-body");
        await userEvent.click(within(modalBody).getByRole("button", {name: "Vissza"}));

        // Egyetlen törlő kérés sem ment ki, és a szerkesztőben maradtunk.
        expect(handleAxios).not.toHaveBeenCalled();
        expect(screen.queryByText("FŐLISTA")).not.toBeInTheDocument();
    });
});
