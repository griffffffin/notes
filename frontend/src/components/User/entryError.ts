/* MI MENT FÉLRE a belépésnél vagy a regisztrációnál — és mit írunk ki róla.

   Miért EGY érték, és nem két boolean? Mert a két korábbi zászló
   (`isLoginError`, `isSignUpError`) olyasmit írt le, amiből egyszerre pontosan
   egy állhat fenn: a felhasználó vagy a belépő, vagy a regisztrációs űrlapon
   van. Két független logikai mező négy állapotot enged meg, amiből kettő
   értelmetlen (mindkettő igaz / a másik űrlapé igaz), és a kódnak mindenhol
   PÁRBAN kellett kezelnie őket — a törléstől (`clearError`) a térköz
   számításáig. Egy union ugyanezt egyetlen, teljes esetlistával mondja el, és a
   fordító számon is kéri, ha egy eset kimarad a szövegtáblából.

   MIÉRT VOLT EZ HIBÁS ÍGY: a felület korábban a belépésnél MINDEN hibára azt
   írta ki, hogy hibás a név vagy a jelszó — akkor is, ha a szerver le volt
   állítva vagy lejárt a kérés. A felhasználó a jelszavát kezdte keresni egy
   hálózati hiba miatt. A regisztrációnál pont fordítva: a 409-en KÍVÜL semmire
   nem szólt, tehát egy 500-as hiba után a képernyőn semmi nem történt. Ez a
   kettő ugyanannak az egy hiányosságnak a két vége: nem különböztettük meg a
   "szerver ismert okból mondott nemet" esetet a "valami más romlott el"-től. */

/* A szerver SZERZŐDÉSES státuszkódjai, amikre külön üzenettel felelünk.

   Nem exportáltak: kifelé csak a lenti `entryError` viszi az értelmüket, és egy
   fogyasztó nélküli export halott kód volna (l. types/api.ts növekedési
   szabálya). A backendhez kötésüket a `backend/src/frontendContract.test.js`
   őrzi — az a fájl SZÖVEGKÉNT olvassa ki ezeket a sorokat, tehát az alakjuk
   megváltoztatása a tesztet is érinti (a teszt hangosan bukik, nem némán). */
const BAD_LOGIN_STATUS = 400;
const NAME_TAKEN_STATUS = 409;
/* ELTÉRÉS a fenti kettőtől: ez NEM a backendhez kötött szám. A regisztráció
   400-at ad a jelszó-szabály megsértésére is — ugyanazt a kódot, mint amit a
   belépés a rossz azonosítókra —, de a KÉT végpont két különböző dolgot ért
   rajta. Itt tehát nem egy közös szerződést nevezünk meg, hanem azt mondjuk ki,
   hogy a regisztrációs ágon a 400 a jelszóról szól. */
const BAD_PASSWORD_STATUS = 400;

/* ELTÉRÉS a BAD_PASSWORD_STATUS-tól: EZ a backendhez KÖTÖTT szám, mint a
   NAME_TAKEN_STATUS. A regisztráció 422-t ad a GYENGE (túl gyakori vagy a névvel
   egyező) jelszóra — a formailag rossztól (400) szándékosan megkülönböztetve,
   mert az itt más üzenetet érdemel: a formátum jó, csak a jelszó nem elég erős.
   A backend párja: create.js WEAK_PASSWORD_STATUS; az egyezést a
   frontendContract.test.js őrzi. */
const WEAK_PASSWORD_STATUS = 422;

export type EntryError = "credentials" | "taken" | "password" | "common" | "request";

/* A `Record<EntryError, string>` nem díszítés: ha az union új esettel bővül és
   ide nem kerül szöveg, az FORDÍTÁSI HIBA — nem egy üres felirat a képernyőn. */
export const ENTRY_ERROR_MESSAGES: Record<EntryError, string> = {
    /* A backend szándékosan ugyanazt mondja ismeretlen névre és rossz jelszóra
       (l. login.js BAD_LOGIN), hogy ne lehessen fiókokat felderíteni — a felület
       ezt a döntést nem áshatja alá egy pontosabb üzenettel. */
    credentials: "Hibás felhasználónév vagy jelszó.",
    taken: "A felhasználónév már foglalt.",
    password: "Helytelen jelszó formátum.",
    /* A formátum jó, de a jelszó gyenge: túl gyakori, vagy megegyezik a névvel.
       A "próbáld újra" itt is félrevezetne — ugyanaz a jelszó megint elbukna —,
       ezért kimondjuk, mit kell tenni: másikat választani. */
    common: "Ez a jelszó túl gyakori. Válassz egy egyedibbet.",
    /* Minden, ami nem a szerver szerződéses "nem"-je: hálózati hiba,
       időtúllépés, 500. Szándékosan nem mondja meg, MI romlott el (az a naplóba
       való, l. logRequestError), csak azt, hogy nem a felhasználón múlt. */
    request: "Szerver hiba.",
};

/* A státuszkódból az, hogy MIT írunk ki. Külön függvény, mert két dolgot köt
   össze, amit érdemes együtt olvasni: hogy melyik űrlapon állunk, és hogy mit
   mondott a szerver.

   A `status` azért lehet `undefined`, mert a `responseStatus` valódi
   alak-vizsgálatot végez (httpError.ts): hálózati hibánál és időtúllépésnél
   nincs válasz, tehát nincs státusz sem — ezek mind a `request` ágra esnek. */
export function entryError(isLogin: boolean, status: number | undefined): EntryError {
    if (isLogin) return status === BAD_LOGIN_STATUS ? "credentials" : "request";
    if (status === NAME_TAKEN_STATUS) return "taken";
    /* A kliens ugyanazt a jelszó-szabályt kényszeríti ki, mint a szerver (a
       kettő egyezését a frontendContract.test.js őrzi), tehát ide csak akkor
       jutunk, ha a két szabály mégis elcsúszott. Ilyenkor a jelszóról szóló
       üzenet a hasznos — a "próbáld újra" félrevezetne, mert az újrapróbálás
       ugyanígy elbukna. */
    if (status === BAD_PASSWORD_STATUS) return "password";
    /* A gyenge jelszó (gyakori vagy a névvel egyező) a szerver saját, formától
       független elutasítása — a kliens ezt nem tudja előre leszűrni (a listát nem
       tölti le), tehát ez a válasz VALÓDI úton is ide ér, nem csak elcsúszáskor. */
    if (status === WEAK_PASSWORD_STATUS) return "common";
    return "request";
}
