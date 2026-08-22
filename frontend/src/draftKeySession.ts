/* A PISZKOZAT-KULCS ÉLETCIKLUSA a bejelentkezett munkamenetben — ÉS A KAPU, amit
   a szerkesztők kérdeznek meg.

   A kulcs a szervertől jön (POST /drafts/key), és kizárólag a memóriában él
   (draftCrypto.ts). Ez a modul mondja meg, MIKOR kérjük le, mikor dobjuk el, és
   VAN-E — mert az utóbbin múlik, hogy a szerkesztő megnyílik-e egyáltalán.

   MIÉRT KAPU, ÉS NEM FIGYELMEZTETÉS. Kulcs nélkül nincs piszkozat, tehát a
   mentetlen munkának nincs helyi másolata — és a kulcs-lekérés pontosan akkor
   bukik el, amikor a MENTÉS is el fog (ugyanaz a hálózat, ugyanaz a szerver).
   Vagyis a védelem épp abban a helyzetben hiányozna, amiért létezik. Egy
   figyelmeztetés ("most nincs védelem") ezt csak leírná; a kapu megszünteti:
   ha nem tudjuk megvédeni a szöveget, akkor meg sem írható. Így nincs
   "védtelen állapot", amit a felhasználónak fejben kellene tartania — és a
   piszkozatról egy szót sem kell neki mondani.

   NÉGY SZABÁLY A KULCS MEGSZERZÉSÉRE, ÉS EGYIK SEM MAGÁTÓL ÉRTETŐDŐ:

   1. BEJELENTKEZÉSKOR kérjük le, nem az első piszkozat-írásnál. A piszkozat
      egyik FŐ keletkezési helye épp a kijelentkezéskori mentés bukása: ott a
      token már lejárhatott, onnan már nem lenne honnan kulcsot kérni.

   2. LAPBETÖLTÉSKOR IS, ha van érvényes token. A bejelentkezés munkamenet-
      sütiben él, tehát egy F5-öt (vagy egy új fület) TÚLÉL — a memóriában tartott
      kulcs viszont nem. (Mérve, a Pi-n, 10 kérés: medián 61 ms, min 39, max 258 —
      a szerkesztő betöltő karikája ennyivel tovább pörög, ami észrevehetetlen.)

   3. ÚJ MUNKAMENET ELEJÉN ELDOBJUK a régi kulcsot. Ha ugyanabban a lapban másik
      felhasználó lép be, a memóriában még az ELŐZŐ fiók kulcsa ül; azzal
      titkosítva az ő piszkozatai visszafejthetetlenek lennének.

   4. KIJELENTKEZÉSKOR NEM DOBJUK EL. Csábító volna ("a munkamenet véget ért"),
      de kárt tenne: a kijelentkezés csak 3 másodpercig várja meg a mentést
      (pendingSave.ts), az újrapróbálás (saveRetry.ts) ennél tovább tart, és a
      végén épp az a PISZKOZAT születne meg, ami a mentetlen munkát őrzi. A kulcs
      így a LAP életéig él — ameddig az a JS-heap, amiben amúgy is ott van minden
      szerkesztett szöveg.

   HA NEM SIKERÜL — AZ ÚJRAPRÓBÁLÁS NÉGY RÉTEGE. Nincs vak közvélemény-kutatás
   (időzített lekérdezgetés a szerver felé), mert az akkor is terhelne, amikor
   semmi baj: minden réteget ESEMÉNY indít, és mind csak addig fut, amíg tényleg
   nincs kulcs.

     a) HÁROM PRÓBA egy lekérésen belül, 1 és 3 másodperc szünettel
        (saveRetry.ts). Ez fedi a leggyakoribb esetet: az élesítés alatt a szerver
        MÉRT 2 553 ms-ig nem válaszol — a második-harmadik próba már beér.
     b) A HÁLÓZAT VISSZATÉRÉSE (`online` esemény): a böngésző szól, amikor megint
        van kapcsolat. Ez a pontos jel egy wifi-váltásra vagy alagút-kijáratra.
     c) A SZERKESZTŐ MEGNYITÁSA (useDraftKeyGate): ha a felhasználó ÉPP ÍRNI
        akar, azonnal próbálunk — és amíg a kapu zárva, tízmásodpercenként újra,
        hogy a hálózat visszatérésekor magától kinyíljon.
     d) A TOKEN MEGÚJULÁSA (aktivitásra, legfeljebb 5 percenként): ez az effekt
        amúgy is újrafut, ilyenkor pótoljuk, ami elmaradt.

   És végül a felhasználó kezében is van eszköz: a szerkesztő hibakártyáján az
   "Adatok ismételt lekérése" gomb ugyanezt indítja (components/loadFailedNotice.tsx). */

import axios from "axios";
import {useEffect, useRef, useSyncExternalStore} from "react";
import {BACKEND_URL} from "./backendUrl";
import {clearDraftKey, hasDraftKey, setDraftKey} from "./draftCrypto";
import {ENDPOINTS} from "./endpoints";
import {logRequestError} from "./log";
import {parseResponse, reportContractFault} from "./contractFault";
import {saveWithRetry} from "./saveRetry";
import {draftKeySchema} from "./types/api";
import type {AuthToken} from "./types/api";

/* Ugyanaz az időkorlát, mint a többi kérésé (contexts/auth.tsx): egy néma
   szerver mellett a kérés különben örökké függne, és sosem derülne ki, hogy
   nincs kulcs. */
const REQUEST_TIMEOUT_MS = 15 * 1000;

/* Amíg a szerkesztő kapuja ZÁRVA áll, ennyinként próbálkozunk újra. Csak addig,
   amíg a kapu zárva — vagyis amíg valaki tényleg írni akar, és nem tud. Tíz
   másodperc elég sűrű ahhoz, hogy egy visszatérő hálózatnál a felhasználó ne
   érezze magát elakadva, és elég ritka ahhoz, hogy egy tartósan halott szerver
   felé se termeljünk forgalmat. */
const RETRY_WHILE_BLOCKED_MS = 10 * 1000;

/* A KAPU ÁLLAPOTA — három érték, mert a felület háromféleképp válaszol rá:
   "loading" → betöltő karika, "ready" → a szerkesztő használható,
   "failed" → hibakártya újrapróbálási lehetőséggel. */
export type DraftKeyStatus = "loading" | "ready" | "failed";

/* MODUL-SZINTŰ ÁLLAPOT ÉS FELIRATKOZÁS — a `useSyncExternalStore` mintája.

   Miért nem React state vagy context: a kulcsot az AuthProvider szerzi meg, a
   kapu kérdezője viszont a fa MÉLYÉN ülő szerkesztő. Contextbe téve minden
   fogyasztó újrarajzolódna a kulcs megérkezésekor, és a mockolt auth-tal futó
   tesztek is átírandók lennének; a modul-szintű regiszter ugyanaz a minta, mint
   a pendingSave.ts-é és a tooltipRegistry.ts-é.

   A `useSyncExternalStore` a React hivatalos kapuja az ilyen külső tárolókhoz:
   megkapja, hogyan iratkozzon fel, és hogyan olvassa ki a PILLANATNYI értéket —
   cserébe garantálja, hogy a renderelt érték sosem lesz elavult. */
let fetchFailed = false;
let retryTick = 0;
const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/* Az állapot SZÁRMAZTATOTT, nem külön tárolt: a kulcs megléte (draftCrypto) és a
   legutóbbi lekérés sorsa együtt adja ki. Két külön igazságforrás előbb-utóbb
   elcsúszna — és a "ready, de nincs kulcs" épp az a néma állapot, ami ellen az
   egész kapu van. */
const draftKeyStatus = (): DraftKeyStatus =>
    hasDraftKey() ? "ready" : (fetchFailed ? "failed" : "loading");

/* A KULCS ÁTVÉTELE — egyetlen ponton. A `setDraftKey` maga csak a memóriába
   teszi; a felületnek szólni is kell, különben a szerkesztő kapuja zárva
   maradna egy már megérkezett kulcs mellett. A tesztek is ezt hívják
   (test/draftKey.ts), hogy pontosan azon az úton kapjanak kulcsot, mint az app.

   A HIBAJELZŐT NEM KELL ITT TÖRÖLNI, és ez szándékos: az állapot SZÁRMAZTATOTT,
   és a kulcs erősebb nála (l. `draftKeyStatus`) — ha van kulcs, a kapu nyitva,
   akármi volt korábban. Írtam ide egy `fetchFailed = false`-t is; a
   mutáció-próba mutatta meg, hogy FÖLÖSLEGES: a kivétele egyetlen tesztet sem
   buktatott, mert a jelzőt a kulcs eldobása (`dropDraftKey`) úgyis lezárja, és
   amíg kulcs van, senki nem nézi. Két mechanizmus ugyanarra annyit ér, hogy
   egyiket sem tudja teszt őrizni — ezért maradt egy. */
export function acceptDraftKey(base64Key: string): void {
    setDraftKey(base64Key);
    emit();
}

/* ÚJ MUNKAMENET: A RÉGI KULCS ELDOBÁSA — ÉS SZÓLNI IS KELL RÓLA.

   A `clearDraftKey` maga csak a memóriából veszi ki a kulcsot; a felíratkozók
   (a szerkesztők kapuja) ebből semmit nem vennének észre. A teszt mutatta meg,
   mi lett volna ebből: felhasználó-váltás után a kapu még "ready"-t mutatott —
   vagyis a szerkesztő NYITVA maradt, KULCS NÉLKÜL. Nem írt volna nyílt szöveget
   (a drafts.ts azt külön őrzi), de a felület hazudott volna: úgy engedett volna
   dolgozni, hogy közben nincs mentés-tartalék.

   A hibaállapotot is lezárja: az új munkamenet még nem próbálkozott, tehát nincs
   mit a rovására írni — várakozás a helyes kezdőállapot.

   A hívója az ÚJ BEJELENTKEZÉS (lentebb): onnantól a memóriában talált kulcs
   már nem ehhez a munkamenethez tartozik. */
function dropDraftKey(): void {
    clearDraftKey();
    fetchFailed = false;
    emit();
}

/* A LEKÉRÉS VÉGLEG ELBUKOTT (mind a három próba). Külön, KIMONDOTT átmenet, nem
   egy belül elrejtett értékadás: így a kapu három állapota (kulcs megjött /
   bukott / még várunk) egy helyen, egymás mellett olvasható — és a tesztek is
   ugyanazon az úton állíthatják elő a bukást, amin az app. */
export function markDraftKeyUnavailable(): void {
    fetchFailed = true;
    emit();
}

/* ÚJRAPRÓBÁLÁS — KÉT ALAKBAN, ÉS A KÜLÖNBSÉG A FELÜLETEN LÁTSZIK.

   A HÁTTÉR-VÁLTOZAT (online esemény, a kapu tízmásodperces órája) a hibaállapotot
   MEGTARTJA. Ez nem lustaság: e nélkül a szerkesztő tízmásodpercenként a
   hibakártya és a betöltő karika között villogna, holott a felhasználó számára
   semmi nem változott — csak a háttérben próbálkozunk. Ha a próba SIKERÜL, a
   kártya magától eltűnik és a szerkesztő megnyílik; ha nem, marad, ami volt.

   A FELHASZNÁLÓ KÉRTE változat (az "Adatok ismételt lekérése" gomb) viszont
   lezárja a hibaállapotot, tehát a karika visszatér — ez a visszajelzés, hogy a
   gombnyomás megtörtént. Ha a próba megint elbukik, a kártya visszajön.

   MINDKETTŐ AKKOR IS LÉPTET, HA MÁR VAN KULCS. Először azt írtam ide, hogy
   ilyenkor ne csináljanak semmit — logikusnak tűnt, hiszen mit kérnénk le? A
   teszt megbuktatta: a kaput a TÁROLÓ írhatatlansága is zárva tarthatja (kulcs
   IDE, kulcs ODA), és azt a mérést épp ez a léptetés indítja újra. Kulcs
   birtokában viszont KÉRÉS nem indul (a lenti effekt kilép), tehát a léptetés
   olcsó: legfeljebb újramérjük a tárolót. */
export function retryDraftKeyInBackground(): void {
    retryTick += 1;
    emit();
}

export function retryDraftKeyOnUserRequest(): void {
    fetchFailed = false;
    retryTick += 1;
    emit();
}

/* A KAPU ÁLLAPOTÁNAK OLVASÁSA. A `useSyncExternalStore` gondoskodik róla, hogy a
   kulcs megérkezésekor a komponens újrarajzolódjon. Nem exportált: a szerkesztők
   a `useDraftKeyGate`-et hívják, ami az újrapróbálást is elintézi — egy puszta
   állapot-olvasó könnyen kapuvá válna, ami nem próbálkozik. */
const useDraftKeyStatus = (): DraftKeyStatus =>
    useSyncExternalStore(subscribe, draftKeyStatus);

/* A SZERKESZTŐ KAPUJA: az állapot, plusz a hozzá tartozó újrapróbálás.

   Kétszer próbálkozik magától: MOUNTKOR (a felhasználó épp írni akar) és amíg a
   kapu zárva, tízmásodpercenként. Az időzítő CSAK addig él, amíg nincs kulcs —
   megvan a kulcs, nincs több kérés. */
export function useDraftKeyGate(): DraftKeyStatus {
    const status = useDraftKeyStatus();

    /* A TÁROLÓ ÍRHATÓSÁGA SZÁNDÉKOSAN NEM FELTÉTELE A KAPUNAK. Volt egy
       változat, ami azt is mérte (privát ablak, letiltott tárolás, tele kvóta —
       ilyenkor a piszkozat nem tud lemenni), és zárva tartotta a szerkesztőt. A
       user buktatta meg, jogosan: a MENTÉSHEZ nem kell localStorage, az csak egy
       EXTRA réteg. Egy hiányzó extra réteg miatt elvenni magát a szerkesztést
       aránytalan — a felhasználó ilyenkor is tud dolgozni és menteni, csak a
       háló hiányzik alóla.

       A kulcs ettől azért más eset: a hiánya jellemzően azt jelenti, hogy a
       SZERVER nem érhető el — vagyis a mentés is bajban van, tehát ott a kapu
       nem vesz el semmit, amit a felhasználó amúgy használhatna. */

    useEffect(() => {
        if (status === "ready") return;
        retryDraftKeyInBackground();
        const timer = setInterval(retryDraftKeyInBackground, RETRY_WHILE_BLOCKED_MS);
        return () => { clearInterval(timer); };
    }, [status]);

    return status;
}

export function useDraftKeySession(token: AuthToken | null): void {
    /* AZ ELŐZŐ RENDER TOKENJE — ebből látszik a kijelentkezés → bejelentkezés
       átmenet (3. szabály). Ref, nem state: senki nem jeleníti meg, és a
       változása nem indíthat újrarajzolást. A TÍPUS KIMONDVA: `null`
       kezdőértékből a fordító `null`-ra szűkítené (l. CLAUDE.md, "kezdőérték ≠
       típus").

       És NEM modul-szintű, pedig a kulcs az: ez a hook egyetlen helyen fut
       (AuthProvider), viszont a tesztek egy fájlon belül többször is
       felépítik-lebontják — modul-szinten az előző teszt tokenje szivárogna át,
       és a "kijelentkezés → bejelentkezés" átmenet némán elmaradna. */
    const previousToken = useRef<AuthToken | null>(null);
    /* AZ ÚJRAPRÓBÁLÁS-SZÁMLÁLÓ a lenti effekt függősége: az újrapróbálás
       (bármelyik alakja) ezt lépteti, és ettől fut újra a lekérés. */
    const tick = useSyncExternalStore(subscribe, () => retryTick);

    useEffect(() => {
        const startsNewSession = previousToken.current === null;
        previousToken.current = token;
        // Kijelentkezve nincs kinek kulcsot kérni (és a régit szándékosan megtartjuk).
        if (token === null) return;
        if (startsNewSession) dropDraftKey();
        // Már van kulcsunk ehhez a munkamenethez: a token 5 percenkénti megújulása
        // nem ok új kérésre (a szerver úgyis ugyanazt adná).
        if (hasDraftKey()) return;

        /* VERSENYHELYZET-ŐR. Ez az effekt újra tud futni (token-megújulás,
           újrapróbálás), és a válaszok fordított sorrendben is visszaérhetnek. A
           veszély nem az azonos kulcs kétszeri beállítása, hanem a KÉSVE
           megérkező, MÁSIK munkamenethez tartozó válasz: az felülírná a friss
           kulcsot, és az új felhasználó piszkozatai olvashatatlanná válnának.
           (A debounce erre nem volna őr — az csak az el nem sült időzítőt vonja
           vissza, a már elindult kérést nem.) */
        let active = true;

        void saveWithRetry(
            (onSuccess, onFailure) => {
                /* A LEMONDOTT LÁNC LEÁLLÍTÁSA. Az `onSuccess` itt nem sikert
                   jelent, hanem azt, hogy a sorozatnak vége — nincs több próba,
                   és mellékhatás sem történik, mert a kulcsot a `then`-ben vettük
                   volna át. Enélkül egy elavult munkamenet lánca még percekig
                   kérdezgetne. */
                if (!active) return onSuccess();
                axios.post<unknown>(BACKEND_URL + ENDPOINTS.draftKey, {}, {
                    timeout: REQUEST_TIMEOUT_MS,
                    headers: {Authorization: "Bearer " + token},
                })
                    .then((response) => {
                        if (!active) return onSuccess();
                        acceptDraftKey(parseResponse(draftKeySchema, response.data, ENDPOINTS.draftKey));
                        onSuccess();
                    })
                    .catch(onFailure);
            },
            (error) => {
                /* MIND A HÁROM PRÓBA ELBUKOTT. A felhasználó felé itt nem
                   jelentünk semmit — a szerkesztő kapuja fogja megmutatni, hogy
                   most nem nyitható meg. A SZERZŐDÉS-hiba viszont a MI hibánk és
                   tartós, ezért éles buildben is elmegy a Pi naplójába
                   (contractFault.ts); ide fut be a `setDraftKey` hossz-
                   ellenőrzésének dobása is. */
                reportContractFault(error);
                logRequestError(error);
                if (!active) return;
                markDraftKeyUnavailable();
            },
        );

        return () => { active = false; };
    }, [token, tick]);

    /* A HÁLÓZAT VISSZATÉRÉSE. A böngésző `online` eseménye pontosan azt jelenti,
       amire várunk — nem kell találgatni időzítővel. A figyelő olcsó, ezért akkor
       is fent marad, ha épp van kulcsunk: az újrapróbálás ilyenkor nem csinál
       semmit. */
    useEffect(() => {
        window.addEventListener("online", retryDraftKeyInBackground);
        return () => { window.removeEventListener("online", retryDraftKeyInBackground); };
    }, []);
}
