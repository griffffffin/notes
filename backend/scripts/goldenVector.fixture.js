/* A BEFAGYASZTOTT E2EE GOLDEN-VEKTOR — a VALÓDI frontend e2ee-kóddal gyártva (2026-09-22),
   MEGOSZTVA a decrypt-export és az exportEnrollment kör-tesztjei közt: egy forrás, hogy a
   minta ne éljen két, csendben elcsúszó másolatban (CLAUDE.md). A vektor gyártása, jelentése
   és karbantartása: a decrypt-export.test.js fejléce.

   A `wrappedMk` és a `ciphertext` a kliens BORSTALANÍTOTT "e2ee1…" alakja (a bors a szerver
   tárolási rétege; a borsozott utat a tesztek sealWithPepper-rel maguk állítják elő). Kis
   KDF-paraméterek (m=8 MiB, t=1) a sebességért — a helyesség független a paraméter nagyságától. */
module.exports = {
    password: "correct horse battery staple",
    kdfSalt: "AwoRGB8mLTQ7QklQV15lbA==",
    kdf: {algorithm: "argon2id", memorySize: 8192, iterations: 1, parallelism: 1},
    mkBase64: "BRAbJjE8R1JdaHN+iZSfqrXAy9bh7PcCDRgjLjlET1o=",
    id: "507f1f77bcf86cd799439011",
    wrappedMk: "e2ee1.iU+mjM4od2F60uUr.69VI94/BHc13T8w7Gp+/4rbh50KJnB3jaxBq+2kJi/vjS3CfANezpHUXdOOC92Q/",
    ciphertext: "e2ee1./1TqUI7byG6Eao96.X8dTQxiu6hi64wiRnYT2SZRz8gQpb0+Cjea579GV/qFmapVQhmiXO1frsyU9mB4OrTOhZfoR/hOPlKKmQeCcGfUXzJG/19d4RT6NYV3iZWa4XVB1FK4zQ9WQxpvlwIJsc4yt5LLEbkP7l5V3JlMi8RG/AA2gnU+etxFSR1mkbNnI0cn29Uu4fHfJ6EPQn3U=",
    content: {
        quote: "A kód olvasható legyen, ne csak működjön.",
        author: "Anon",
        fontSize: 18,
        createdAt: "2026-09-22T10:00:00.000Z",
    },
};
