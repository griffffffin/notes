/* A TÉTLENSÉG-FIGYELÉS paraméterei — két óra és a közös eseményhalmaz, egy
   helyen, mert csak EGYÜTT van értelmük.

   Mi számít aktivitásnak: ezekre az eseményekre mondjuk azt, hogy a felhasználó
   a gép előtt van. A figyelőket mindig `{passive: true}`-val kell felkötni: ez
   azt ígéri a böngészőnek, hogy nem akadályozzuk meg az alapértelmezett
   viselkedést — enélkül minden görgetésnél meg kellene várnia a kódunkat, ami
   akadozást okoz.

   A KÉT HATÁRIDŐ VISZONYA a lényeg, nem a konkrét értékük:

     AUTOSAVE_IDLE_MS  <  IDLE_LOGOUT_MS

   A szerkesztő autosave-e (l. components/Editor/useIdleTimer.ts) azért ér
   valamit, mert ELŐBB sül el, mint ahogy a munkamenet lejár: az otthagyott,
   mentetlen munka még ÉRVÉNYES tokennel mentődik el. Ha a két érték elcsúszna
   (az autosave nőne vagy a kijelentkezés csökkenne), az autosave a token lejárta
   UTÁN futna: a mentés 401-gyel elveszne, a felhasználó munkája nyom nélkül —
   és semmi nem jelezné, mert a felület pontosan ugyanúgy viselkedne. A viszonyt
   ezért teszt is őrzi (idle.test.ts).

   Az IDLE_LOGOUT_MS ezen felül a token szerveroldali élettartamával is egyezik
   (backend/src/token.js: 15m): így a felület és a token egyszerre jár le, nem
   fordulhat elő, hogy a képernyő kijelentkezettnek látszik, miközben a lemásolt
   süti a szerveren még működik. Az a kötés két CSOMAG között van, tehát azt csak
   komment tartja — ha ez az érték változik, a backendét is állítani kell. */

/* Az `as const` itt nem formaság: nélküle a lista típusa `string[]` lenne, vele
   a hat KONKRÉT eseménynév. A haszna a felhasználási helyen (contexts/auth.tsx)
   fog látszani: a `window.addEventListener` típusa ismeri az eseményneveket, így
   egy elgépelt "mousemoove" fordításkor bukik, nem csendben soha nem tüzelve. */
export const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

// Ennyi tétlenség után jelentkeztet ki az auth (contexts/auth.tsx).
export const IDLE_LOGOUT_MS = 15 * 60 * 1000;

// Ennyi tétlenség után ment magától a szerkesztő — szándékosan hamarabb.
export const AUTOSAVE_IDLE_MS = 10 * 60 * 1000;
