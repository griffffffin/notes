/* Naplózás, ami CSAK fejlesztés közben szólal meg.

   Miért kell: a hibaágaink a szerver üzenetét írták a böngésző konzoljára (pl.
   "Érvénytelen token"). A felhasználónak ez semmit nem mond, annak viszont, aki
   megnyitja a konzolt, belső működést szivárogtat — ugyanaz az elv, amiért a
   szerver sem részletezi a hibáit (backend/src/app.js).

   Miért nem a build dobja ki (esbuild drop: ["console"]): mert az a build-eszköz
   verziófüggő viselkedésére épülne, és NÉMÁN elromlana, ha az eszköz cserélődik.
   Pontosan ez történt: ez a Vite már rolldown-alapú, ott a drop nem hatott, és a
   buildben bent maradt mind a kilenc hívás — a konfig szerint viszont "kész" volt.
   Az import.meta.env.DEV ezzel szemben a Vite szerződéses része: éles buildben
   false-ra fordul, és a holt ágat minden bundler kihajítja.

   A NEM elkapott hibákat ez nem érinti: azokat a böngésző írja ki, nem mi —
   ezért marad értelme az éles source mapnek (vite.config.js). */

export const logDev = (...args) => {
    if (import.meta.env.DEV) console.log(...args);
};

/* A kérés-hibák egységes alakja. A szerver a válasz törzsében küldi az üzenetet;
   ha a kérés el sem jutott odáig (hálózati hiba), csak a message van meg. */
export const logRequestError = (error) => logDev(error?.response?.data ?? error?.message ?? error);
