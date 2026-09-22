import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import LockScreen from "./lockScreen";
import {ThemeProvider} from "../../contexts/theme";
import {unlock} from "../../masterKeySession";
import type {Enrollment} from "../../types/api";

/* A ZÁROLT MUNKAMENET FELOLDÓ KÉPERNYŐJE. A tét itt a képernyő VISELKEDÉSE: a beírt
   jelszóval és a fiók beiratkozásával old fel, a rossz jelszót kimondja és újra
   próbálhatóvá teszi, a kiút a kijelentkezés. Maga a kulcs-származtatás a
   masterKeySession.test.ts tárgya — itt csak azt bizonyítjuk, hogy a HELYES ponton, a
   HELYES adattal hívjuk. */

/* A MESTERKULCS-SESSION KIVÁLTVA: a valódi `unlock` Argon2id-t futtat (MÉRVE ~1,2 s), ami
   ezt a felület-tesztet lassúvá és a kriptóhoz kötötté tenné. Az `importOriginal` spread a
   modul valódi alakját tartja meg (a fordító ezt a `vi.mock(import(...))` alakban számon is
   kéri), csak az `unlock`-ot cseréli kémre — l. vi-mock memória. */
vi.mock(import("../../masterKeySession"), async (importOriginal) => ({
    ...(await importOriginal()),
    unlock: vi.fn(async () => {}),
}));

/* A HITELESÍTÉSI CONTEXT PÓTLÉKA — a közös, VALÓDI alakhoz mért segéddel (test/mockAuth.ts).
   A képernyőnek csak a `logout` kell belőle; a `vi.hoisted` kell, mert a mock-gyár a fájl
   tetejére emelődik, a segéd elé. */
const {auth} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true, session: {name: "teszt"}});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

// A beiratkozás alakja a valódi Enrollment-hez mérve (satisfies) — a becsomagolt MK + só + KDF.
const ENROLLMENT = {
    wrappedMk: "e2ee1.aaaa.bbbb",
    kdfSalt: "c2FsdA==",
    kdf: {algorithm: "argon2id", memorySize: 65536, iterations: 3, parallelism: 1},
} satisfies Enrollment;

const renderLock = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <LockScreen enrollment={ENROLLMENT}/>
        </ThemeProvider>
    </CookiesProvider>,
);

const unlockButton = () => screen.getByRole("button", {name: "Feloldás"});
const WRONG_PASSWORD = "Hibás jelszó.";

beforeEach(() => {
    vi.mocked(unlock).mockReset();
    vi.mocked(unlock).mockResolvedValue(undefined);
    vi.mocked(auth.logout).mockClear();
});

afterEach(() => {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("LockScreen — feloldás", () => {
    it("üres mezőn a Feloldás tiltott, jelszóval engedélyeződik", async () => {
        renderLock();
        expect(unlockButton()).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        expect(unlockButton()).toBeEnabled();
    });

    it("a beírt jelszóval és a fiók beiratkozásával old fel", async () => {
        renderLock();
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(unlockButton());

        await waitFor(() => expect(vi.mocked(unlock)).toHaveBeenCalledWith("Teszt1234", ENROLLMENT));
        // Sikeres feloldásnál nincs hibaüzenet (kontroll a hibaághoz).
        expect(screen.queryByText(WRONG_PASSWORD)).not.toBeInTheDocument();
    });

    it("rossz jelszónál kimondja a hibát, és a gomb újra aktív", async () => {
        // A GCM-kicsomagolás rossz jelszóra DOB (a címke nem stimmel) — ez maga a jelszó-próba.
        vi.mocked(unlock).mockRejectedValue(new Error("A kicsomagolás elhasalt."));
        renderLock();
        await userEvent.type(screen.getByLabelText("Jelszó"), "rossz-jelszo");
        await userEvent.click(unlockButton());

        expect(await screen.findByText(WRONG_PASSWORD)).toBeVisible();
        // A felhasználó javíthat: a gomb nem ragad be a beküldés-jelzőn.
        expect(unlockButton()).toBeEnabled();
    });

    it("a hibaüzenet az első leütésre eltűnik", async () => {
        vi.mocked(unlock).mockRejectedValue(new Error("A kicsomagolás elhasalt."));
        renderLock();
        await userEvent.type(screen.getByLabelText("Jelszó"), "rossz");
        await userEvent.click(unlockButton());
        expect(await screen.findByText(WRONG_PASSWORD)).toBeVisible();

        await userEvent.type(screen.getByLabelText("Jelszó"), "x");
        expect(screen.queryByText(WRONG_PASSWORD)).not.toBeInTheDocument();
    });

    it("a Kijelentkezés gomb a logout-ot hívja, és NEM süti el a feloldó űrlapot", async () => {
        renderLock();
        // Kitöltött jelszó mellett is: ha a gomb submitelne (nem type=button), az elindítaná
        // a feloldást — épp ezt a nested-submit csapdát zárja ki az állítás.
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(screen.getByRole("button", {name: "Kijelentkezés"}));

        expect(auth.logout).toHaveBeenCalledTimes(1);
        expect(vi.mocked(unlock)).not.toHaveBeenCalled();
    });

    it("beküldés közben a gomb tiltva, a második kattintás nem indít új feloldást", async () => {
        // Az `unlock` FÜGGŐBEN marad, így a beküldés-jelző végig igaz (nincs .catch, nincs unmount).
        let resolveUnlock: () => void = () => {};
        vi.mocked(unlock).mockReturnValue(new Promise<void>((resolve) => { resolveUnlock = resolve; }));
        renderLock();
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(unlockButton());

        expect(unlockButton()).toBeDisabled();
        // A letiltott gombon a kattintás nem megy át → az Argon2 nem indul újra.
        await userEvent.click(unlockButton());
        expect(vi.mocked(unlock)).toHaveBeenCalledTimes(1);

        resolveUnlock();
    });
});
