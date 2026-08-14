import {describe, expect, it} from "vitest";
import {ACTIVITY_EVENTS, AUTOSAVE_IDLE_MS, IDLE_LOGOUT_MS} from "./idle";

/* A két tétlenségi határidő VISZONYA — ez a fájl egyetlen néma hibát őriz.

   Ha az autosave a kijelentkezés UTÁNRA csúszna, a mentés lejárt tokennel indulna:
   401-et kapna, és a felhasználó otthagyott munkája nyom nélkül elveszne. A
   felület közben pontosan ugyanúgy viselkedne — sem hibaüzenet, sem naplóbejegyzés
   nem árulná el. Kézzel ez a hiba csak úgy derülne ki, ha valaki tényleg
   elsétál egy megkezdett szerkesztéstől, és negyed óra múlva visszajön. */
describe("tétlenségi határidők", () => {
    it("az autosave HAMARABB sül el, mint a tétlenségi kijelentkezés", () => {
        expect(AUTOSAVE_IDLE_MS).toBeLessThan(IDLE_LOGOUT_MS);
    });

    /* Nem elég, hogy kisebb: kell egy értelmes RÉS is. A mentés hálózati kérés,
       ami eltarthat pár másodpercig, és a lassú válasz sem veszhet el. Egy perc
       bőven fedezi; ennél szorosabb beállítás gyanús. */
    it("marad legalább egy perc a mentésre a kijelentkezés előtt", () => {
        expect(IDLE_LOGOUT_MS - AUTOSAVE_IDLE_MS).toBeGreaterThanOrEqual(60 * 1000);
    });

    it("mindkét határidő pozitív (a 0 azonnali kijelentkezést/mentést jelentene)", () => {
        expect(AUTOSAVE_IDLE_MS).toBeGreaterThan(0);
        expect(IDLE_LOGOUT_MS).toBeGreaterThan(0);
    });

    /* A két órát UGYANAZ az eseményhalmaz hajtja — enélkül az autosave elsülhetne
       olyankor, amikor a felhasználó valójában aktív (vagy elmaradhatna, amikor
       tényleg elsétált). A lista nem lehet üres: akkor semmi nem számítana
       aktivitásnak, és mindkét óra azonnal lejárna. */
    it("van mit aktivitásnak tekinteni, és a billentyű meg az egér is benne van", () => {
        expect(ACTIVITY_EVENTS.length).toBeGreaterThan(0);
        expect(ACTIVITY_EVENTS).toContain("keydown");
        expect(ACTIVITY_EVENTS).toContain("mousemove");
    });
});
