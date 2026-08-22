/* A HÁTTÉRBEN FUTÓ KÉRÉSEK ÚJRAPRÓBÁLÁSA.

   (A neve a mentésekről szól, mert értük készült — de a piszkozat-kulcs lekérése
   is ezt használja, ugyanezzel az indoklással: az is a háttérben fut, és az is
   csak a MÚLÓ hibákon segít, l. draftKeySession.ts.)

   Két mentési út fut a felhasználó tudta nélkül: a tétlenségi autosave és a
   LEVÁLÁSKORI mentés (kijelentkezéskor, amikor a szerkesztő eltűnik). Ezeknek
   nincs felületük, ahol hibát lehetne jelezni — ha elbuknak, a szöveg csak a
   piszkozatban marad meg (drafts.ts).

   A piszkozat viszont a VÉGSŐ szalmaszál, nem az első védvonal. A bukások nagy
   része MÚLÓ: egy wifi-váltás, egy épp újrainduló szerver (élesítéskor 1-2
   másodperc), egy pillanatnyi terhelés. Ezekre a helyes válasz nem a piszkozat,
   hanem az, hogy MÉG EGYSZER megpróbáljuk — így a felhasználónak fel sem tűnik,
   és a piszkozat-felajánlás tényleg ritka, valódi eset marad (tartós hálózat-
   hiány).

   NÖVEKVŐ VÁRAKOZÁS (1s, majd 3s). Azonnali újrapróbálás értelmetlen: ha a
   szerver épp újraindul, a másodperc törtrésze alatt sem lesz kész. A kis
   lépcső viszont elég: ennél hosszabb várakozás alatt a lap már bezárulhat.

   HÁROM PRÓBA ÖSSZESEN. Ennél több nem ad sokat: ami három próbát kibír, az nem
   múló hiba. Cserébe a felhasználó gépe sem küld a végtelenségig kéréseket egy
   halott szerver felé.

   AMIT NEM CSINÁL: nem őrzi meg a kérést a lap bezárása UTÁNRA. A böngésző a
   lap eltűnésekor a függő kéréseket eldobja — ezért a leváláskori mentés első
   próbája `keepalive`-val megy (l. contexts/auth.tsx), az újrapróbálások pedig
   csak addig futnak, amíg az oldal él (kijelentkezéskor igen, lap-bezáráskor
   nem). A maradék esetet fedi a piszkozat. */

const RETRY_DELAYS_MS = [1000, 3000];

type SaveAttempt = (onSuccess: () => void, onFailure: (error: unknown) => void) => void;

/**
 * Elindít egy mentést, és bukás esetén megismétli — legfeljebb kétszer.
 *
 * A VISSZATÉRÉSI ÉRTÉK egy promise, ami akkor teljesül, amikor a sorozat véget
 * ért — sikerrel VAGY feladással. Nem utasítódik el: a bukás nem kivétel, hanem
 * kezelt állapot (az `onGiveUp` már lefutott). Erre a kijelentkezésnek van
 * szüksége: megvárja a mentést, mielőtt eldobná a munkamenetet (l. pendingSave.ts).
 *
 * @param attempt      egy próbálkozás; a két visszahívást ő hívja meg
 * @param onGiveUp     az utolsó próba is elbukott (ide jön a piszkozat mentése)
 * @param schedule     időzítő — a tesztek adják át, hogy ne kelljen valódi időt várni
 */
export function saveWithRetry(
    attempt: SaveAttempt,
    onGiveUp: (error: unknown) => void,
    schedule: (callback: () => void, delayMs: number) => void = setTimeout,
): Promise<void> {
    return new Promise((resolve) => {
        const run = (remaining: readonly number[]) => {
            attempt(resolve, (error) => {
                const [delay, ...rest] = remaining;
                /* Elfogytak a próbák: innen a hívó dolga a mentendő tartalom
                   megőrzése. A hibát TOVÁBBADJUK, hogy a naplózás is megtörténjen. */
                if (delay === undefined) {
                    onGiveUp(error);
                    return resolve();
                }
                schedule(() => run(rest), delay);
            });
        };
        run(RETRY_DELAYS_MS);
    });
}
