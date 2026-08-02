import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeAll, describe, expect, it, vi} from "vitest";
import Modal from "./modal";

/* A jsdom (29.1.1) nem implementálja a <dialog> showModal()/close() metódusait,
   ezért a prototípuson pótoljuk őket. Csak annyit modellezünk a natív
   viselkedésből, amire a komponens logikája épül: az `open` attribútum állítását.
   A valódi top-layer/backdrop a böngészőé — a teszt a nyit/zár LOGIKÁT és a
   gombok visszahívásait ellenőrzi, nem a natív renderelést. */
beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; });
});

const renderModal = (overrides = {}) => {
    const props = {isShow: true, handleClose: vi.fn(), handleDelete: vi.fn(), color: "warning", ...overrides};
    render(<Modal {...props}/>);
    return props;
};

describe("Törlés-modal", () => {
    it("isShow=true esetén megnyitja a dialógust", () => {
        renderModal({isShow: true});
        expect(document.querySelector("dialog").open).toBe(true);
    });

    it("isShow=false esetén zárva marad", () => {
        renderModal({isShow: false});
        expect(document.querySelector("dialog").open).toBe(false);
    });

    it("a Törlés gomb a handleDelete-et hívja", async () => {
        const props = renderModal();
        await userEvent.click(screen.getByRole("button", {name: "Törlés"}));
        expect(props.handleDelete).toHaveBeenCalledOnce();
        expect(props.handleClose).not.toHaveBeenCalled();
    });

    it("a Vissza gomb a handleClose-t hívja", async () => {
        const props = renderModal();
        await userEvent.click(screen.getByRole("button", {name: "Vissza"}));
        expect(props.handleClose).toHaveBeenCalledOnce();
        expect(props.handleDelete).not.toHaveBeenCalled();
    });

    it("a bezáró X a handleClose-t hívja", async () => {
        const props = renderModal();
        await userEvent.click(screen.getByRole("button", {name: "Bezárás"}));
        expect(props.handleClose).toHaveBeenCalledOnce();
    });

    it("a gombok type=button-ok, nem sütik el a körülvevő Save-űrlapot", () => {
        // Ha submit-ok lennének, a törlés-kattintás a körülvevő <form>-ot is
        // elsütné: az azonnal navigálna és a törlés BEFEJEZÉSE ELŐTT töltené újra
        // a listát — ettől ragadt bent a törölt to-do "szelleme".
        renderModal();
        expect(screen.getByRole("button", {name: "Törlés"})).toHaveAttribute("type", "button");
        expect(screen.getByRole("button", {name: "Vissza"})).toHaveAttribute("type", "button");
    });

    it("unmountkor bezárja a nyitott dialógust (nincs top-layer-szellem)", () => {
        // A törlés utáni navigáció úgy unmountolja a modált, hogy még nyitva van.
        // A cleanupnak zárnia kell, különben a <dialog> a top-layerben ragadna.
        const {unmount} = render(
            <Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()} color="warning"/>,
        );
        expect(document.querySelector("dialog").open).toBe(true);
        HTMLDialogElement.prototype.close.mockClear();
        unmount();
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    });
});
