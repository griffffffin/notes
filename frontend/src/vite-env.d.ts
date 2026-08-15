/* A KÖRNYEZETI VÁLTOZÓK TÍPUSA — ez a fájl teszi a `import.meta.env`-et
   ellenőrizhetővé.

   A `.d.ts` kiterjesztés "declaration file": csak TÍPUSOKAT tartalmaz, futásidejű
   kódot nem. Nem is kell importálni sehol — a fordító a `include`-ban szereplő
   összes ilyen fájlt magától figyelembe veszi, és a bennük leírt interfészeket
   HOZZÁFŰZI a máshol (itt: a Vite-ban) deklaráltakhoz. Ezt hívják deklaráció-
   összefésülésnek (declaration merging).

   MIÉRT KELL. A Vite alapból `any`-nek hagyja az env-értékeket, mert nem tudhatja,
   milyen kulcsokat használunk. Az `any` viszont pontosan az a fajta üres ígéret,
   ami ellen ez a projekt a legtöbbet teszi — mérve (2026-08-15): a `const x:
   number = import.meta.env.VITE_BACKEND` ELŐTTE simán átment a typecheck-en, pedig
   a VITE_BACKEND egy URL.

   A `strictImportMetaEnv` A LÉNYEGI SOR, nem a lenti felsorolás. A Vite az
   ImportMetaEnv-et egy `Record<string, any>`-ból származtatja, ha ez a kapcsoló
   nincs kimondva (l. vite/types/importMeta.d.ts) — vagyis a puszta felsorolás
   MELLETT bármilyen kitalált kulcs is `any` maradna, csendben. A kapcsolóval a
   fallback eltűnik, és egy elgépelt kulcs FORDÍTÁSI HIBA: mérve, a
   `import.meta.env.VITE_BACKEDN` így hangzik el — "Property 'VITE_BACKEDN' does
   not exist on type 'ImportMetaEnv'. Did you mean 'VITE_BACKEND'?".

   AMIT EZ NEM OLD MEG: a HIÁNYZÓ értéket. A típus a fordítónak szól, az env-fájl
   viszont futásidőben (illetve buildkor) hiányozhat — akkor a `VITE_BACKEND`
   `undefined`, hiába mondja itt a típus, hogy `string`. Erre külön, futásidejű
   ellenőrzés van: src/backendUrl.ts. */
/// <reference types="vite/client" />

interface ViteTypeOptions {
    strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
    /* Az API gyökere a BÖNGÉSZŐ szemszögéből. Éles buildben SZÁNDÉKOSAN üres
       string (.env.production): akkor a kérések relatívak, mert ugyanaz az Express
       szolgálja ki a frontendet és az API-t. Fejlesztéskor a Pi címe, mert a Vite
       dev szerver külön porton fut. Az üres string tehát ÉRVÉNYES érték — a
       futásidejű ellenőrzés is így bánik vele (backendUrl.ts). */
    readonly VITE_BACKEND: string;
}
