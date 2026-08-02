const bcrypt = require("bcrypt");

/* A JELSZÓ-TÁROLÁS két összetartozó paramétere — EGY helyen, mert a kettőnek
   együtt kell mozognia.

   A bcrypt KÖLTSÉGTÉNYEZŐJE (SALT_WORK_FACTOR) azt szabja meg, hányszorozódik a
   hash kiszámításának ideje: minden +1 kétszerezi. Ez szándékos lassítás — a
   jelszó offline törését teszi drágává. Mérés a Pi-n: 10 = 130 ms, 11 = 244 ms,
   12 = 486 ms, 13 = 1031 ms.

   Az ÁLCA-HASH (DUMMY_HASH) a bejelentkezés időzítés-szivárgása ellen véd. Ha
   ismeretlen névnél azonnal válaszolnánk, létező névnél pedig megvárnánk a
   bcrypt ~130 ms-át, a válaszidőből kiderülne, létezik-e a fiók — hiába azonos a
   hibaüzenet. Ezért ismeretlen névnél is lefuttatunk egy összehasonlítást, EZZEL
   a hash-sel (l. controllers/Users/login.js).

   KRITIKUS, hogy az álca-hash UGYANAZZAL a költségtényezővel készüljön, mint a
   valódi jelszavaké — különben a két ág mérhetően eltérő ideig futna, és épp azt
   árulná el, amit el akarunk rejteni. Korábban a tényező két helyen szerepelt
   (a create.js konstansaként és a login.js hashSync-hívásába beégetve), és csak
   egy komment kérte az olvasót, hogy tartsa őket szinkronban. Itt a kötés
   SZERKEZETI: az álca-hash ugyanabból a konstansból készül, elcsúszni nem tud.

   Indításkor egyszer számoljuk ki (hashSync): a login-végpontnak készen kell
   állnia, nem kérésenként újragyártani.

   Ha a tényező valaha változik: a bcrypt a hashbe írja, tehát a RÉGI jelszavak
   továbbra is a régivel ellenőrződnek. Kevert tényezők = felhasználónként eltérő
   válaszidő, azaz visszanyílik ez a szivárgás. Emeléskor tehát a meglévő
   jelszavakat is újra kell hashelni (a következő sikeres belépéskor). */
const SALT_WORK_FACTOR = 10;
const DUMMY_HASH = bcrypt.hashSync("nincs-ilyen-jelszo", SALT_WORK_FACTOR);

module.exports = {SALT_WORK_FACTOR, DUMMY_HASH};
