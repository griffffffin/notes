/* AZ API GYÖKERE — egy helyen kiolvasva, ELLENŐRIZVE.

   Minden szerverhívás URL-je ezzel a szöveggel kezdődik (contexts/auth.tsx). Eddig
   két helyen állt `import.meta.env.VITE_BACKEND`-ként, ellenőrzés nélkül — és ez a
   projekt tiltólistás hibaosztálya volt, csak a kérés MÁSIK végén, mint a
   válasz-sémáké (types/api.ts):

     - Ha az env-fájl hiányzik vagy a kulcs nincs benne, az érték `undefined`, a
       kérés címe pedig szó szerint "undefined/to-dos" lesz. Semmi nem hibázik: a
       böngésző elküldi, a szerver 404-gyel válaszol, a felületen üres lista vagy
       pörgő betöltő marad. A `vite-env.d.ts` típusa ezt NEM fogja meg — az a
       fordítónak szól, az env-fájl viszont futásidőben (buildkor) hiányzik.
     - Ha valaki elgépeli a KULCS nevét, azt viszont már a fordító megfogja
       (l. vite-env.d.ts, `strictImportMetaEnv`) — az a másik fél védelem.

   MIÉRT A BETÖLTÉSKOR DOBUNK, és nem az első kérésnél? Mert ez nem futásidejű
   hiba, hanem KONFIGURÁCIÓS: a rosszul buildelt vagy rosszul telepített app EGYIK
   kérése sem működne. Aki hibás beállítással indítja, azonnal, névvel kapja meg az
   okot (az ErrorBoundary kiírja), nem tíz percnyi „miért üres a lista?" után.

   AZ ÜRES STRING ÉRVÉNYES, ezért `typeof`-fal vizsgálunk, nem `if (!url)`-lel: éles
   buildben a VITE_BACKEND SZÁNDÉKOSAN üres (.env.production), mert akkor ugyanaz
   az Express szolgálja ki a frontendet és az API-t, tehát relatív URL kell. Egy
   „üresség"-vizsgálat pont az éles beállítást utasítaná el. */

const url: unknown = import.meta.env.VITE_BACKEND;

if (typeof url !== "string") {
    throw new Error(
        "Hiányzik a VITE_BACKEND környezeti változó — enélkül minden kérés az " +
        "\"undefined/…\" címre menne. Fejlesztéskor a frontend/.env fájlba kell " +
        "(minta: .env.example), éles buildhez a .env.production adja (üres = relatív URL).");
}

export const BACKEND_URL: string = url;
