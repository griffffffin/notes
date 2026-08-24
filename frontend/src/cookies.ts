/* MINDEN SÜTI, AMIT EZ AZ APP ÍR — a nevük és a beállításaik egy helyen.

   Az app HÁROM sütit használ, és mindhármat a böngészőben futó kód írja; a
   szerver egyetlen sütit sem állít be és nem is olvas (a hitelesítés
   Authorization fejléccel megy — épp ez a javítás a régi apphoz képest, ami a
   felhasználó azonosítóját egy kliens-oldali sütiből hitte el).

   Miért egy fájlban? Mert a süti-nevek KÉTOLDALI kötések: az egyik oldalon a
   beállító kód, a másikon egy olvasó, ami nem is mindig TypeScript (a
   themeBackground-ot az index.html boot-szkriptje olvassa, még a bundle előtt).
   Egy elgépelt név nem hibázik, csak nem talál semmit — a kijelentkezés nem
   törölné a tokent, a téma nem állna vissza. Egy helyen tartva a nevek
   ellenőrizhetők (l. contexts/themeBoot.test.ts), és az "milyen sütiket rak le ez
   az app?" kérdésre is egyetlen fájl a válasz. */

import type {ReactCookieProps} from "react-cookie";

/* A beállítás-típus a react-cookie NYILVÁNOS felületéről jön (a
   CookiesProvider `defaultSetOptions` propjának típusa), nem az alatta dolgozó
   universal-cookie-ból: így nem importálunk tranzitív függőségből, viszont a
   VALÓDI típust kapjuk, nem egy kézzel írt mását. Ez nem formaság — enélkül egy
   elgépelt mezőnév (`samesite`) csendben hatástalan maradna; a típussal a
   fordító a helyszínen szól. */
type CookieOptions = NonNullable<ReactCookieProps["defaultSetOptions"]>;

export const COOKIES = {
    /* A bejelentkezési token (JWT). A neve 2026-08-18-ig "user" volt, a régi
       apptól örökölve, ami tényleg a FELHASZNÁLÓT tartotta benne — az volt a fő
       biztonsági gyengesége. Ma aláírt token van benne, tehát a régi név már
       félrevezette az olvasót.

       Az átnevezés ára egyszeri: a régi néven tárolt sütit az app nem találja
       meg, tehát akinek épp nyitva volt a lapja, annak újra be kell
       jelentkeznie. Ez azért nem több ennél, mert ez MUNKAMENET-süti (l.
       SESSION_COOKIE lentebb), tehát a böngésző bezárásakor amúgy is eltűnik, és
       maga a token is 15 perc után lejár. Átmeneti visszaolvasás SZÁNDÉKOSAN
       nincs: egy ideiglenes ág, aminek a törlését el lehet felejteni, több kárt
       tenne, mint egy újbóli bejelentkezés. */
    token: "token",
    // A választott téma: az értéke a THEMES.*.cookieValue ("black" / "white").
    theme: "backgroundColor",
    /* A téma háttérszíne hexben. EZT NEM A REACT OLVASSA, hanem az index.html
       boot-szkriptje, még a stíluslapok előtt — ebből festi ki a lapot, hogy ne
       villanjon fehéret. A kettősséget teszt őrzi (contexts/themeBoot.test.ts). */
    themeBackground: "themeBackground",
} as const;

/* A PATH: a süti az egész oldalra szól, nem csak arra az útvonalra, ahol épp
   beállítottuk. Enélkül a /quotes/update/:id oldalon írt téma-süti a főoldalon
   nem is látszana.

   A SAMESITE: azt mondja meg a böngészőnek, elküldje-e a sütit, ha a kérés egy
   MÁSIK oldalról indul. Kimondjuk, mert a böngészők alapértelmezései eltérnek és
   idővel változtak is — egy néma viselkedés-váltást pedig nem hagyunk kommentre.

   Miért a "strict" és nem a szokásos "lax"? Mert nálunk a szigorúbb változatnak
   NINCS ÁRA. A "strict" hátránya máshol az, hogy egy külső linkről érkezve az
   első kérés süti NÉLKÜL megy, tehát egy szerveroldali munkamenetre épülő app
   kijelentkezettnek látszik. Ez ránk nem áll:

     - a szerver a sütit SOHA nem nézi (a token Authorization fejlécben megy,
       amit a böngésző nem tesz hozzá magától) — a navigációs kéréssel tehát
       semmi dolgunk;
     - a sütit a SAJÁT oldalunkon futó JS olvassa (`document.cookie`, illetve az
       index.html boot-szkriptje), a SameSite pedig a KÉRÉSEKRE vonatkozik, nem a
       JS-hozzáférésre — a megosztott idézet-linkről érkező látogatónál is
       ugyanúgy megvan a téma és a bejelentkezés.

   Vagyis ma egyik érték sem véd meg semmitől (nincs mit ellopni egy
   cross-site kéréssel), de a "strict" a szűkebb, és AKKOR válik teherhordóvá,
   amikor a token szerver által beállított HttpOnly sütibe költözik — onnantól a
   süti maga lesz a hitelesítés, és ott a CSRF már valódi kérdés. A szűkebb
   alapállásból bővíteni tudatos lépés lesz; a bővebbet szűkíteni elfelejtődik.

   A SECURE (csak HTTPS-en menjen) SZÁNDÉKOSAN HIÁNYZIK: az app ma sima HTTP-n
   szolgál ki a helyi hálózaton, tehát a secure süti soha nem íródna ki — a
   bejelentkezés némán működésképtelen lenne. Ez a HTTPS-re váltással egy
   csomagban jön, a token HttpOnly-vá tételével együtt. */
const BASE: CookieOptions = {path: "/", sameSite: "strict"};

/* A MUNKAMENET-SÜTI KIKERÜLT INNEN. A tokent ma a SZERVER teszi sütibe,
   HttpOnly-ként — a lapon futó JavaScript nem látja, tehát nem is állíthatja be.
   A jelzőit (köztük a lejárat hiányát, ami a böngésző bezárásakor megszünteti a
   munkamenetet) a backend mondja ki, egy helyen: backend/src/tokenCookie.js.

   Ami itt maradt, az a TÉMA sütije: az továbbra is a kliensé, mert nem titok és
   nem munkamenet-adat. */

/* A TÉMA sütijei viszont TÚLÉLIK a böngésző bezárását. Enélkül (mérve: ma
   `backgroundColor=white; Path=/`, azaz lejárat nélküli munkamenet-süti) a
   világos témát választó felhasználó minden új böngésző-indításnál sötéten
   kapná vissza az appot — némán, hiszen semmi nem hibázik. Egy megjelenítési
   beállítás nem titok és nem munkamenet-adat: az a helyes, ha megmarad.

   Egy év: elég hosszú ahhoz, hogy a gyakorlatban tartósnak érződjön, és véges,
   tehát egy évig nem használt gépről magától eltűnik. A lejáratot a BÖNGÉSZŐ
   tartja számon (nem a szerver és nem az app): a tárolt időpont után a sütit már
   nem adja oda a lapnak, és takarításkor törli — akkor is, ha közben soha nem
   nyitottuk meg az oldalt. Amíg viszont használjuk, minden témaváltás
   ÚJRAÍRJA a sütit, tehát az egy év mindig a legutóbbi használattól számol.

   FIGYELEM, ez a felső korlát nem a mi kezünkben van: a böngészők maguk is
   megvágják a JS-ből írt sütik élettartamát (a Chrome 400 napra, a Safari
   nyomkövetés-védelme jóval rövidebbre, napokra). Ez dokumentált böngésző-
   viselkedés, nálunk nem mérve — a szám tehát felső korlát, nem ígéret. Emiatt
   nem is építünk rá semmit: a téma elvesztése legrosszabb esetben egy újbóli
   kattintás, nem adatvesztés. */
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
export const PERSISTENT_COOKIE: CookieOptions = {...BASE, maxAge: ONE_YEAR_IN_SECONDS};
