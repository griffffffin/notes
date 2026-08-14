import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import DeleteAndModal from "./deleteAndModal";
import {requireElement} from "../../test/dom";
import {axiosResponse} from "../../test/axiosResponse";

/* A jsdom nem implementálja a <dialog> showModal()/close() metódusait — a
   megerősítő modál ezekre épül —, ezért a prototípuson pótoljuk (mint a
   modal.test.jsx). Csak az `open` állítását modellezzük; a natív top-layer a
   böngészőé, a teszt a törlés-LOGIKÁT vizsgálja. */
beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});

/* Állandó handleAxios (a komponens nem függ tőle effektben, de a mock stabil
   legyen). A pótlék a közös segédből jön, tehát a TELJES Auth alakot adja. */
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

/* A DeleteAndModal a szerkesztőben él; a törlés utáni navigációt egy valódi
   route-táblával figyeljük: a /to-dos route egy jelző-szöveget render. */
const renderDelete = () => render(
    <MemoryRouter initialEntries={["/to-dos/update/todo-9"]}>
        <Routes>
            <Route path="/to-dos/update/:id" element={
                <DeleteAndModal todoId="todo-9" color="warning" handleLinkClicked={vi.fn()}
                                setIsCategoryClicked={vi.fn()} setIsColorClicked={vi.fn()}
                                handleCategoryChange={vi.fn()}/>}/>
            <Route path="/to-dos" element={<div>FŐLISTA</div>}/>
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        then(axiosResponse({}));
        return Promise.resolve();
    });
});

describe("Törlés folyamata", () => {
    it("megerősítés után a /to-dos/delete-et hívja az id-val, majd a listára navigál", async () => {
        renderDelete();

        // A kártya Törlés gombja (az első ilyen) megnyitja a megerősítő modált.
        await userEvent.click(screen.getAllByRole("button", {name: "Törlés"})[0]);
        // A modálon belüli Törlés erősíti meg a műveletet.
        const modalBody = requireElement(".modal-body", HTMLElement);
        await userEvent.click(within(modalBody).getByRole("button", {name: "Törlés"}));

        expect(handleAxios).toHaveBeenCalledWith("/to-dos/delete", {id: "todo-9"},
            expect.any(Function), expect.any(Function));
        // A sikeres törlés a to-do listára visz.
        await waitFor(() => expect(screen.getByText("FŐLISTA")).toBeInTheDocument());
    });

    it("a Vissza gomb megszakítja: nem töröl és nem navigál", async () => {
        renderDelete();

        await userEvent.click(screen.getAllByRole("button", {name: "Törlés"})[0]);
        // A modálon belüli Vissza elveti a törlést.
        const modalBody = requireElement(".modal-body", HTMLElement);
        await userEvent.click(within(modalBody).getByRole("button", {name: "Vissza"}));

        // Egyetlen törlő kérés sem ment ki, és a szerkesztőben maradtunk.
        expect(handleAxios).not.toHaveBeenCalled();
        expect(screen.queryByText("FŐLISTA")).not.toBeInTheDocument();
    });
});
