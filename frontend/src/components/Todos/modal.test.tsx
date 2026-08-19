import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeAll, describe, expect, it, vi} from "vitest";
import Modal from "./modal";
import type {ModalProps} from "./modal";
import {requireElement} from "../../test/dom";

/* A jsdom (29.1.1) nem implementálja a <dialog> showModal()/close() metódusait,
   ezért a prototípuson pótoljuk őket. Csak annyit modellezünk a natív
   viselkedésből, amire a komponens logikája épül: az `open` attribútum állítását.
   A valódi top-layer/backdrop a böngészőé — a teszt a nyit/zár LOGIKÁT és a
   gombok visszahívásait ellenőrzi, nem a natív renderelést.

   A `this` KIMONDVA `HTMLDialogElement`: prototípus-metódusként a hívás
   gazdájáról van szó, amit a fordító magától nem tud kitalálni. A `closeSpy`
   pedig azért él külön változóban, mert a prototípuson keresztül (a típus
   szerint sima metódus) nem lehetne a mock-műveleteit hívni. */
const closeSpy = vi.fn(function (this: HTMLDialogElement) { this.open = false; });

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.close = closeSpy;
});

// A dialógus mindig a lapon van (a komponens rendereli); ha nincs, az hiba.
const dialog = () => requireElement("dialog", HTMLDialogElement);

const renderModal = (overrides: Partial<ModalProps> = {}) => {
    const props = {
        isShow: true, handleClose: vi.fn(), handleDelete: vi.fn(), color: "warning",
        isDeleting: false, deleteFailed: false,
        ...overrides,
    } satisfies ModalProps;
    render(<Modal {...props}/>);
    return props;
};

describe("Törlés-modal", () => {
    it("isShow=true esetén megnyitja a dialógust", () => {
        renderModal({isShow: true});
        expect(dialog().open).toBe(true);
    });

    it("isShow=false esetén zárva marad", () => {
        renderModal({isShow: false});
        expect(dialog().open).toBe(false);
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
            <Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()} color="warning"
                   isDeleting={false} deleteFailed={false}/>,
        );
        expect(dialog().open).toBe(true);
        closeSpy.mockClear();
        unmount();
        expect(closeSpy).toHaveBeenCalled();
    });
});

/* A TÖRLÉS VÁRAKOZÓ ÉS BUKOTT ÁLLAPOTA. Korábban a dialógus a kattintás
   pillanatában bezárult, tehát a sikeres és a sikertelen törlés PONTOSAN ugyanúgy
   nézett ki — a felhasználó nem tudta eldönteni, megtörtént-e a művelet. */
describe("Törlés-modal — folyamatban és bukás", () => {
    const deleteButton = () => screen.queryByRole("button", {name: "Törlés"});

    it("alapállapot: kérdez, és ott a Törlés gomb (kontroll)", () => {
        renderModal();

        expect(screen.getByText("Biztosan törlöd?")).toBeVisible();
        expect(deleteButton()).toBeEnabled();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("folyamatban: a FEJLÉC mondja ('Törlés…'), és a törzs eltűnik", () => {
        renderModal({isDeleting: true});

        expect(screen.getByRole("heading")).toHaveTextContent("Törlés…");
        expect(screen.queryByText("Biztosan törlöd?")).not.toBeInTheDocument();
        /* Nincs törzs, tehát gomb sincs: a Törlésen nincs mit nyomni, a "Vissza"
           felirat pedig megszakítást ígérne — olyat, amit nem tudunk betartani.
           A kiút az X (és az ESC): azok nem ígérnek visszavonást. */
        expect(deleteButton()).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Vissza"})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Bezárás"})).toBeInTheDocument();
    });

    it("bukás után a TÖRLÉS gombon a fókusz (a következő lépés az újrapróbálás)", () => {
        /* Megnyitáskor a Vissza kapja a fókuszt, hogy egy véletlen Enter ne
           töröljön. A bukás után viszont a felhasználó MÁR döntött: törölni
           akart — a következő lépése az újrapróbálás, tehát az legyen kéznél. */
        /* A szín SZÁNDÉKOSAN "danger": ilyenkor a Vissza gomb IS `btn-danger`
           osztályt kap (piros to-do szerkesztésekor ez a valóság), tehát egy
           szín-alapú szelektor a rossz gombot találná meg. Élőben mérve pontosan
           ez történt, mielőtt a gomb saját azonosítót kapott. */
        const {rerender} = render(<Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()}
                                         color="danger" isDeleting={false} deleteFailed={false}/>);

        rerender(<Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()}
                        color="danger" isDeleting={false} deleteFailed={true}/>);

        expect(document.activeElement).toBe(screen.getByRole("button", {name: "Törlés"}));
    });

    it("bukás: a kérdés helyén a hiba, riasztásként, és ÚJRA lehet próbálni", () => {
        renderModal({deleteFailed: true});

        expect(screen.getByRole("alert")).toHaveTextContent("A törlés nem sikerült!");
        expect(screen.queryByText("Biztosan törlöd?")).not.toBeInTheDocument();
        // A bukás oka jellemzően múló, tehát a második próbálkozás sikerülhet.
        expect(deleteButton()).toBeEnabled();
    });

    it("a kérdés és a hiba UGYANAZT a sort használja (azonos betű, azonos hely)", () => {
        /* Nem külön hibasor a kérdés mellé: a dialógusnak egyszerre egy
           mondanivalója van. Ha kettő látszana, a felhasználó nem tudná, melyikre
           válaszol a gombokkal. (A folyamatban-állapot ezekhez képest a FEJLÉCBE
           került — ott nincs is mire válaszolni.) */
        const {rerender} = render(<Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()}
                                         color="warning" isDeleting={false} deleteFailed={false}/>);
        const line = screen.getByText("Biztosan törlöd?");

        rerender(<Modal isShow={true} handleClose={vi.fn()} handleDelete={vi.fn()}
                        color="warning" isDeleting={false} deleteFailed={true}/>);

        // UGYANAZ a DOM-elem, csak más szöveggel — nem egy második, ráépülő sor.
        expect(line).toHaveTextContent("A törlés nem sikerült!");
        expect(line.className).toBe("ms-2 pb-3");
    });
});
