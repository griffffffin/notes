/* A KIJELENTKEZÉS MEGVÁRJA A MENTÉST.

   A szerkesztőből NAVIGÁLNI csak mentés után lehet: a useBlocker elkapja a
   navigációt, ment, és csak a válasz megérkezése után enged tovább. A
   KIJELENTKEZÉS viszont nem navigáció, hanem állapotváltás (a token sütije
   törlődik, a route-fa átvált a belépő képernyőre) — a blocker nem látja. Eddig
   ezért a szerkesztő ELŐBB tűnt el, és a mentése a leválás pillanatában, a
   háttérben indult el; ha az elbukott, csak a piszkozat maradt.

   Ez a modul ugyanazt a szabályt adja a kijelentkezésnek, ami a navigációra már
   érvényes: **előbb a mentés, aztán a kilépés**. A szerkesztő bejelentkezik ide
   egy „még van mentenivalóm" függvénnyel, a kijelentkezés pedig megvárja.

   MIÉRT MODUL-SZINTŰ REGISZTER, ÉS NEM CONTEXT. Mert a kijelentkezés az
   AuthProvideren belül történik, a szerkesztő viszont a fa MÉLYÉN ül — egy
   contexten át a gyerek nem tud "felfelé" szolgáltatást adni a szülőnek. A
   modul-szintű regiszter erre a legegyszerűbb, és ugyanúgy tesztelhető (l.
   tooltipRegistry.ts, ugyanez a minta).

   EGYSZERRE EGY szerkesztő él (a route-fa nem rendereli kettőt), de a regiszter
   Set — így egy jövőbeli, több szerkesztős elrendezés sem borítja fel: mindet
   megvárjuk. */

type PendingSave = () => Promise<void>;

const pending = new Set<PendingSave>();

/* A szerkesztő mountkor bejelentkezik, leváláskor kiiratkozik (a visszaadott
   függvénnyel — ez a React `useEffect` szerződése). */
export function registerPendingSave(save: PendingSave): () => void {
    pending.add(save);
    return () => { pending.delete(save); };
}

/* MEDDIG VÁRUNK. A mentés a rossz esetben nem egy pillanat: egy kérés
   időtúllépése 15 másodperc, és az újrapróbálás (saveRetry.ts) ezt még kétszer
   megismétli — a felhasználó akár háromnegyed percig bámulna egy nem reagáló
   kijelentkezés-gombot. Ezért a várakozásnak felső korlátja van: annyi, amennyi
   egy EGÉSZSÉGES mentéshez bőven elég (a mérés szerint a Pi századmásodpercek
   alatt válaszol), de nem több.

   A korlát letelte után NEM veszik el semmi: a mentés a háttérben fut tovább, és
   ha mégis elbukik, a piszkozat őrzi meg a szöveget (drafts.ts). */
const MAX_WAIT_MS = 3000;

/* Megvárja az összes függő mentést — legfeljebb `MAX_WAIT_MS`-ig. A hibát
   ELNYELI: a mentés saját hibaága (újrapróbálás, majd piszkozat) már lefutott, a
   kijelentkezést pedig nem akadályozhatja meg egy sikertelen mentés — a
   felhasználó kilépni akart. */
export async function flushPendingSaves(timeoutMs = MAX_WAIT_MS): Promise<void> {
    const saves = Promise.allSettled([...pending].map((save) => save()));
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([saves, deadline]);
}
