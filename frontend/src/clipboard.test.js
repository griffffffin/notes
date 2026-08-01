import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {copyToClipboard} from "./clipboard";

const TEXT = "http://example.test/quotes/Anonymous/42";

/* A jsdom nem ismeri az execCommand-ot (nincs benne vágólap), ezért kémet teszünk
   a helyére, és azt is elkapjuk, MIT jelölt ki a kód a hívás pillanatában — a
   másolás ugyanis a kijelölésre dolgozik, tehát a kijelölt szöveg a bizonyíték. */
let selectedAtCopy;

beforeEach(() => {
    selectedAtCopy = null;
    document.execCommand = vi.fn(() => {
        const field = document.activeElement;
        selectedAtCopy = field?.value?.slice(field.selectionStart, field.selectionEnd);
        return true;
    });
});

afterEach(() => {
    delete navigator.clipboard;
    vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
    /* A HÁZI HÁLÓ esete: sima HTTP-n a böngésző NEM adja oda a navigator.clipboard-ot.
       Ez a projekt valós felállása (a Pi IP-címén megy az app), és pont ezt kell a
       tartalék útnak kiszolgálnia — enélkül a megosztás-gomb telefonról néma lenne. */
    it("navigator.clipboard NÉLKÜL (sima HTTP) a régi másolás-paranccsal másol", async () => {
        expect(navigator.clipboard).toBeUndefined();

        await expect(copyToClipboard(TEXT)).resolves.toBe(true);

        expect(document.execCommand).toHaveBeenCalledWith("copy");
        expect(selectedAtCopy).toBe(TEXT);
    });

    it("a másolás után nem marad ideiglenes mező a lapon", async () => {
        await copyToClipboard(TEXT);

        expect(document.querySelectorAll("textarea")).toHaveLength(0);
    });

    /* A szerkesztőben épp gépelhet a felhasználó: a másolás nem lophatja el a
       kurzort az idézet-mezőből. */
    it("a fókuszt visszaadja annak, akin a másolás előtt volt", async () => {
        const editor = document.createElement("textarea");
        document.body.appendChild(editor);
        editor.focus();

        await copyToClipboard(TEXT);

        expect(document.activeElement).toBe(editor);
        editor.remove();
    });

    it("HTTPS-en (navigator.clipboard van) a modern API-t használja", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        navigator.clipboard = {writeText};

        await expect(copyToClipboard(TEXT)).resolves.toBe(true);

        expect(writeText).toHaveBeenCalledWith(TEXT);
        expect(document.execCommand).not.toHaveBeenCalled();
    });

    // Megtagadott engedélynél sem adjuk fel: marad a tartalék út.
    it("ha a modern API elbukik, a régi másolás-paranccsal próbálkozik", async () => {
        navigator.clipboard = {writeText: vi.fn(() => Promise.reject(new Error("denied")))};

        await expect(copyToClipboard(TEXT)).resolves.toBe(true);

        expect(document.execCommand).toHaveBeenCalledWith("copy");
        expect(selectedAtCopy).toBe(TEXT);
    });

    it("false-t ad, ha a másolás nem sikerült", async () => {
        document.execCommand = vi.fn(() => false);

        await expect(copyToClipboard(TEXT)).resolves.toBe(false);
    });
});
