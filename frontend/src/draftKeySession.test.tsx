import {act, render, screen, waitFor} from "@testing-library/react";
import axios from "axios";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {acceptDraftKey, markDraftKeyUnavailable, retryDraftKeyInBackground,
    retryDraftKeyOnUserRequest, useDraftKeyGate, useDraftKeySession} from "./draftKeySession";
import {clearDraftKey, decryptDraft, encryptDraft, hasDraftKey, setDraftKey} from "./draftCrypto";
import {ENDPOINTS} from "./endpoints";
import {axiosResponse} from "./test/axiosResponse";
import type {ReactElement} from "react";

/* A PISZKOZAT-KULCS ÉLETCIKLUSA — mikor kérjük le, és mikor NEM.

   Miért érdemes külön tesztelni: a hibái mind NÉMÁK. Ha a kulcs nem érkezik meg,
   a felület pontosan ugyanúgy néz ki, csak a piszkozat nem születik meg — és ez
   akkor derül ki, amikor már késő. Ha pedig a rossz kulcs kerül a memóriába, a
   piszkozat kiíródik, de visszaolvasni soha többé nem lehet.

   Az axios AUTOMOCKOLVA (l. contexts/auth.test.tsx ugyanezért): hálózat nincs,
   de a hook a maga valójában fut. */
vi.mock(import("axios"));

const postSpy = () => vi.mocked(axios.post);

// 32 bájtos kulcsok base64-ben — ugyanabban az alakban, ahogy a szerver adja.
const KEY_A = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
const KEY_B = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));

/* A MUNKAMENETET A FELHASZNÁLÓNÉV AZONOSÍTJA, nem a token: azt HttpOnly süti
   hordozza, amit a JavaScript nem lát (l. contexts/auth.tsx). A hooknak csak arra
   van szüksége, hogy észrevegye a munkamenet-váltást — és a névvel ez STABIL is,
   szemben a korábbival, ami ötpercenként megújult. */
const USER = "elso-felhasznalo";
const OTHER_USER = "masodik-felhasznalo";

function Probe({user}: {user: string | null}) {
    useDraftKeySession(user);
    return null;
}

/* A KAPU PRÓBÁJA: pontosan azt csinálja, amit a szerkesztő — megkérdezi az
   állapotot, és ezzel be is indítja a saját újrapróbálásait. */
function GateProbe() {
    return <span data-testid="allapot">{useDraftKeyGate()}</span>;
}

const gateStatus = () => screen.getByTestId("allapot").textContent;

/* A LEKÉRÉS HÁROM PRÓBÁBÓL ÁLL (saveRetry.ts: 1 s, majd 3 s szünet). A bukást
   vizsgáló teszteknek végig kell futtatniuk a sorozatot, különben a maradék
   próbálkozások a KÖVETKEZŐ tesztbe csúsznának át, és ott számolnának bele a
   kérésekbe — hol zöld, hol piros teszteket okozva.

   ÉS AZ ÓRÁT MÁR A RENDER ELŐTT ÁT KELL VENNI: a `vi.useFakeTimers()` csak a
   UTÁNA ütemezett időzítőket látja. Mérve: renderelés után átvéve a második és
   harmadik próba SOHA nem futott le (a teszt egy próbát látott három helyett),
   a valódi órára ütemezett maradék pedig ott lógott a következő teszt fölött. */
const renderAndDrain = async (ui: ReactElement) => {
    vi.useFakeTimers();
    const view = render(ui);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    vi.useRealTimers();
    return view;
};

// Hányszor kértünk kulcsot? (A többi végpont hívása ebben a fájlban nem fordul elő.)
const keyRequests = () =>
    postSpy().mock.calls.filter(([url]) => url.includes(ENDPOINTS.draftKey));

beforeEach(() => {
    clearDraftKey();
    postSpy().mockReset();
    postSpy().mockResolvedValue(axiosResponse(KEY_A));
});

afterEach(() => {
    clearDraftKey();
    // Az egyik teszt előreállítja az órát (l. ott az indoklást) — ne szivárogjon tovább.
    vi.useRealTimers();
});

describe("a kulcs megszerzése", () => {
    it("bejelentkezéskor lekéri, a SÜTIVEL hitelesítve", async () => {
        const {rerender} = render(<Probe user={null} />);
        expect(keyRequests()).toHaveLength(0);

        rerender(<Probe user={USER} />);

        await waitFor(() => expect(hasDraftKey()).toBe(true));
        /* A `withCredentials` nélkül a kérés hitelesítetlenül menne el (a böngésző
           cross-origin nem csatolja magától a sütit), 401-et kapna — és a
           piszkozat-védelem csendben megszűnne. Authorization fejléc NINCS. */
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.draftKey), {},
            expect.objectContaining({withCredentials: true}));
    });

    it("LAPBETÖLTÉSKOR is lekéri, ha már van munkamenet", async () => {
        /* A bejelentkezés munkamenet-sütiben él, tehát egy F5-öt túlél — a
           memóriában tartott kulcs viszont nem. E nélkül az újratöltés után
           csendben megszűnne a piszkozat-védelem. */
        render(<Probe user={USER} />);

        await waitFor(() => expect(hasDraftKey()).toBe(true));
    });

    it("kijelentkezve NEM kér kulcsot", () => {
        render(<Probe user={null} />);

        expect(keyRequests()).toHaveLength(0);
        expect(hasDraftKey()).toBe(false);
    });

    it("a munkamenet MEGÚJULÁSA nem indít új kérést", async () => {
        const {rerender} = render(<Probe user={USER} />);
        await waitFor(() => expect(hasDraftKey()).toBe(true));

        /* A VÉDELEM MA KETTŐS, és ezt érdemes kimondani. Korábban a hook a
           munkamenet tokenjét kapta, ami ötpercenként megújult: minden megújulás
           új prop-értéket jelentett, az effekt lefutott, és csak a "már van
           kulcsunk" korai kilépés akadályozta meg a fölösleges kérést. Ma a hook a
           NEVET kapja, ami megújuláskor változatlan — az effekt tehát le sem fut.

           A korai kilépés mégis a helyén marad: az effektet az újrapróbálás-
           számláló (tick) is újrafuttathatja, és ott ugyanúgy nem szabad új kulcsot
           kérni. Azt a "kulcs birtokában az újrapróbálás nem küld új KÉRÉST" teszt
           méri; ez itt a stabil prop-ot rögzíti. */
        rerender(<Probe user={USER} />);

        await waitFor(() => expect(keyRequests()).toHaveLength(1));
    });
});

describe("a kulcs eldobása", () => {
    it("kijelentkezéskor MEGTARTJA a kulcsot — hogy a késve születő piszkozat kiírható legyen", async () => {
        /* SZÁNDÉKOS DÖNTÉS, nem feledékenység: a kijelentkezés csak 3 másodpercig
           várja meg a mentést (pendingSave.ts), az újrapróbálás viszont tovább
           tart — a piszkozat gyakran a kijelentkezés UTÁN íródik ki. Kulcs nélkül
           az a szöveg veszne el, amiért az egész mechanizmus van. */
        const {rerender} = render(<Probe user={USER} />);
        await waitFor(() => expect(hasDraftKey()).toBe(true));

        rerender(<Probe user={null} />);

        expect(hasDraftKey()).toBe(true);
    });

    it("ÚJ bejelentkezésnél eldobja a régi kulcsot, és a régivel írt piszkozat nem tér vissza", async () => {
        /* Ha ugyanabban a lapban másik felhasználó lép be, a memóriában még az
           előző fiók kulcsa ül. Az ő piszkozatai azzal titkosítva neki soha nem
           lennének visszafejthetők. */
        const {rerender} = render(<Probe user={USER} />);
        await waitFor(() => expect(hasDraftKey()).toBe(true));
        const writtenByFirstUser = encryptDraft("az első felhasználó szövege");

        rerender(<Probe user={null} />);
        postSpy().mockResolvedValue(axiosResponse(KEY_B));
        rerender(<Probe user={OTHER_USER} />);

        await waitFor(() => expect(keyRequests()).toHaveLength(2));
        expect(() => decryptDraft(writtenByFirstUser)).toThrow();
    });
});

describe("ha a kulcs nem szerezhető meg", () => {
    it("hálózati hibánál NINCS kulcs — de HÁROM próbát tesz, mielőtt feladja", async () => {
        postSpy().mockRejectedValue(new Error("Network Error"));

        await renderAndDrain(<Probe user={USER} />);

        /* Három próba, 1 és 3 másodperc szünettel (saveRetry.ts). Ez fedi a
           leggyakoribb esetet: az élesítés alatt a szerver MÉRT 2 553 ms-ig nem
           válaszol — a második-harmadik próba már beér. */
        expect(keyRequests()).toHaveLength(3);
        expect(hasDraftKey()).toBe(false);
    });

    it("ROSSZ ALAKÚ válasznál sincs kulcs (a szerződés-hiba a hibaágra fut)", async () => {
        // Burkolóba tett kulcs: pontosan az az elcsúszás, amit a séma megfog.
        postSpy().mockResolvedValue(axiosResponse({key: KEY_A}));

        await renderAndDrain(<Probe user={USER} />);

        expect(hasDraftKey()).toBe(false);
    });

    it("HIBÁS HOSSZÚ kulcsot nem vesz át", async () => {
        postSpy().mockResolvedValue(axiosResponse(btoa(String.fromCharCode(...new Uint8Array(16)))));

        await renderAndDrain(<Probe user={USER} />);

        expect(hasDraftKey()).toBe(false);
    });
});

/* VERSENYHELYZET A BETÖLTÉSBEN — a hook `active` őre.

   Két kulcs-kérés lehet egyszerre a levegőben (felhasználó-váltás), és a
   válaszok FORDÍTOTT sorrendben is visszaérhetnek. Ha a régi válasz felülírná a
   frisset, az új felhasználó piszkozatai a RÉGI kulccsal titkosítódnának —
   vagyis a saját szövegét soha nem kapná vissza. Semmi nem hibázik közben.

   A mock GYŰJTI a válaszokat ahelyett, hogy azonnal felelne: így a teszt süti el
   őket, fordított sorrendben. */
describe("versenyhelyzet a kulcs-lekérésben", () => {
    it("a KÉSVE érkező RÉGI válasz nem írja felül a friss kulcsot", async () => {
        const resolvers: ((key: string) => void)[] = [];
        postSpy().mockImplementation(() => new Promise((resolve) => {
            resolvers.push((key) => resolve(axiosResponse(key)));
        }));

        const {rerender} = render(<Probe user={USER} />);
        await waitFor(() => expect(resolvers).toHaveLength(1));
        // Felhasználó-váltás: kijelentkezés, majd egy MÁSIK fiók belépése.
        rerender(<Probe user={null} />);
        rerender(<Probe user={OTHER_USER} />);
        await waitFor(() => expect(resolvers).toHaveLength(2));

        // A FRISS válasz érkezik előbb, a RÉGI utána.
        resolvers[1]?.(KEY_B);
        await waitFor(() => expect(hasDraftKey()).toBe(true));
        resolvers[0]?.(KEY_A);
        /* MEGVÁRJUK, hogy a késve érkező válasz FELDOLGOZÁSA is lefusson —
           különben a teszt csak azért volna zöld, mert még nem futott le.
           Mutáció-próbával mérve: e nélkül az `active` őr eltávolítása NEM
           buktatta ezt a tesztet, vagyis pontosan azt nem vizsgálta, amiért
           megírtuk. Egy "nem történik semmi" állítást nem lehet kivárni, csak a
           feldolgozás elvégzését. */
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        /* A memóriában a friss (KEY_B) kulcsnak kell lennie. Úgy kérdezzük meg,
           ahogy élesben számít: titkosítunk vele, majd a KEY_B-vel próbáljuk
           visszafejteni — ha a régi kulcs ült be, ez dob. */
        const envelope = encryptDraft("az új felhasználó szövege");
        setDraftKey(KEY_B);
        expect(decryptDraft(envelope)).toBe("az új felhasználó szövege");
    });
});

/* A KAPU ÁLLAPOTGÉPE — ezt kérdezi a szerkesztő, és ettől függ, lehet-e írni.

   A három állapot közti átmenetek NÉMÁN romlanak el: egy rosszul kezelt átmenet
   nem hibaüzenetet ad, hanem örökké pörgő karikát vagy egy hibakártyát, ami
   sosem tűnik el. */
describe("a kapu állapota", () => {
    it("várakozásból hibába, onnan a felhasználó kérésére vissza várakozásba, majd készbe", () => {
        clearDraftKey();
        render(<GateProbe />);
        expect(gateStatus()).toBe("loading");

        act(() => { markDraftKeyUnavailable(); });
        expect(gateStatus()).toBe("failed");

        /* A HÁTTÉR-ÚJRAPRÓBÁLÁS NEM TÖRLI A HIBÁT. E nélkül a szerkesztő
           tízmásodpercenként a hibakártya és a karika között villogna, holott a
           felhasználó számára semmi nem változott. */
        act(() => { retryDraftKeyInBackground(); });
        expect(gateStatus()).toBe("failed");

        // A gombnyomás viszont látható visszajelzést kap: újra várakozunk.
        act(() => { retryDraftKeyOnUserRequest(); });
        expect(gateStatus()).toBe("loading");

        act(() => { acceptDraftKey(KEY_A); });
        expect(gateStatus()).toBe("ready");
    });

    it("kulcs birtokában az újrapróbálás nem küld új KÉRÉST", async () => {
        render(<Probe user={USER} />);
        await waitFor(() => expect(hasDraftKey()).toBe(true));
        const before = keyRequests().length;

        act(() => { retryDraftKeyInBackground(); });
        act(() => { retryDraftKeyOnUserRequest(); });

        expect(keyRequests()).toHaveLength(before);
    });
});

/* AZ ÚJRAPRÓBÁLÁS ESEMÉNY-VEZÉRELT RÉTEGEI.

   Nincs vak lekérdezgetés a szerver felé: minden újrapróbálást ESEMÉNY indít, és
   csak addig, amíg tényleg nincs kulcs. Ezek a tesztek azt kérik számon, hogy a
   három esemény (hálózat visszatérése, szerkesztő megnyitása, a nyitott
   szerkesztő órája) tényleg indít is lekérést. */
describe("az újrapróbálás rétegei", () => {
    beforeEach(() => {
        clearDraftKey();
        postSpy().mockRejectedValue(new Error("Network Error"));
    });

    it("a HÁLÓZAT VISSZATÉRÉSE (online esemény) újra lekéri a kulcsot", async () => {
        await renderAndDrain(<Probe user={USER} />);
        const before = keyRequests().length;

        act(() => { window.dispatchEvent(new Event("online")); });

        await waitFor(() => expect(keyRequests().length).toBeGreaterThan(before));
    });

    it("a SZERKESZTŐ MEGNYITÁSA azonnal újrapróbál (a felhasználó épp írni akarna)", async () => {
        const {rerender} = await renderAndDrain(<Probe user={USER} />);
        const before = keyRequests().length;

        // A szerkesztő megnyitása = a kapu hookjának mountja.
        rerender(<><Probe user={USER} /><GateProbe /></>);

        await waitFor(() => expect(keyRequests().length).toBeGreaterThan(before));
    });

    it("a HÁTTÉRBEN SIKERÜLT próba MAGÁTÓL kinyitja a kaput", async () => {
        /* A hibaállapotot nem a próbálkozás TÉNYE törli (attól villogna a
           képernyő), hanem a SIKERE. A felhasználónak nem kell nyomnia semmit:
           amint a hálózat visszatér, a szerkesztő magától használhatóvá válik. */
        postSpy().mockRejectedValue(new Error("Network Error"));
        await renderAndDrain(<><Probe user={USER} /><GateProbe /></>);
        expect(gateStatus()).toBe("failed");

        postSpy().mockResolvedValue(axiosResponse(KEY_A));
        act(() => { window.dispatchEvent(new Event("online")); });

        await waitFor(() => expect(gateStatus()).toBe("ready"));
    });

    it("egy KORÁBBI munkamenet hibája nem látszik az ÚJ munkamenet elején", async () => {
        /* A hibaállapot a KULCS mellett él, tehát a siker után is ott maradhatna
           észrevétlenül: a kapu "ready", mert van kulcs. Csakhogy egy
           felhasználó-váltásnál a kulcsot eldobjuk — és ha a régi hibajelző
           életben maradt volna, az ÚJ munkamenet azonnal hibakártyát kapna,
           mielőtt egyetlen kérés is elindult volna. */
        postSpy().mockRejectedValue(new Error("Network Error"));
        const {rerender} = await renderAndDrain(<><Probe user={USER} /><GateProbe /></>);
        expect(gateStatus()).toBe("failed");
        postSpy().mockResolvedValue(axiosResponse(KEY_A));
        act(() => { window.dispatchEvent(new Event("online")); });
        await waitFor(() => expect(gateStatus()).toBe("ready"));

        // Kijelentkezés, majd egy MÁSIK fiók belépése — a válasz még nem érkezett meg.
        rerender(<><Probe user={null} /><GateProbe /></>);
        postSpy().mockImplementation(() => new Promise(() => undefined));
        rerender(<><Probe user={OTHER_USER} /><GateProbe /></>);

        expect(gateStatus()).toBe("loading");
    });

    it("a MÉG FEL NEM OLDOTT hiba sem öröklődik át az új munkamenetre", async () => {
        /* Az előző teszt párja: ott a hiba után SIKER is volt, itt nincs. Az új
           munkamenet így sem kezdhet hibakártyával — még egyetlen kérése sem
           indult el. (Két külön értékadás őrzi a kettőt; egyik sem fölösleges,
           ezért mindkettőnek külön tesztje van.) */
        postSpy().mockRejectedValue(new Error("Network Error"));
        const {rerender} = await renderAndDrain(<><Probe user={USER} /><GateProbe /></>);
        expect(gateStatus()).toBe("failed");

        rerender(<><Probe user={null} /><GateProbe /></>);
        postSpy().mockImplementation(() => new Promise(() => undefined));
        rerender(<><Probe user={OTHER_USER} /><GateProbe /></>);

        expect(gateStatus()).toBe("loading");
    });

    it("a NYITOTT, de zárt kapu tízmásodpercenként újra próbálkozik", async () => {
        vi.useFakeTimers();
        render(<><Probe user={USER} /><GateProbe /></>);
        // Az első lánc (három próba) lefut, a kapu bezárul.
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        const before = keyRequests().length;

        // A kapu órája: tíz másodperc múlva magától újra próbálkozik.
        await act(async () => { await vi.advanceTimersByTimeAsync(10 * 1000); });
        vi.useRealTimers();

        expect(keyRequests().length).toBeGreaterThan(before);
    });
});
