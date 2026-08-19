const bcrypt = require("bcrypt");

/* A JELSZÓ-TÁROLÁS két összetartozó paramétere — EGY helyen, mert a kettőnek
   együtt kell mozognia.

   A bcrypt KÖLTSÉGTÉNYEZŐJE (SALT_WORK_FACTOR) azt szabja meg, hányszorozódik a
   hash kiszámításának ideje: minden +1 kétszerezi. Ez szándékos lassítás — a
   jelszó offline törését teszi drágává.

   MÉRVE EZEN A GÉPEN (Pi 4B, 2026-08-18; hash / compare, ms):
       10 = 129 / 126     11 = 245 / 242     12 = 493 / 490
       13 = 973 / 968     14 = 1938 / 1951   15 = 3896 / 3914

   A 10-ről 11-re emelés 2026-08-18-án történt. MIÉRT NEM TÖBB: a bcrypt a libuv
   NÉGY szálas threadpoolján fut, tehát a költség nem csak a támadót lassítja,
   hanem a saját kiszolgálásunkat is — négy párhuzamos bejelentkezési kérés a
   teljes poolt lefoglalja (amit a fájlműveletek is használnak). Minden +1 tehát
   megkétszerezi egy hitelesítés NÉLKÜLI kérés terhelő erejét is. A 20-as
   nagyságrend (amit fölvetettünk) a mérésből extrapolálva ~125 másodperc lenne
   bejelentkezésenként, és az indulás is annyit állna a lenti hashSync-en — az app
   használhatatlanná válna. A 11 az a pont, ahol a lassítás érezhetően drágítja a
   törést, de a belépés még azonnalinak érződik.

   A KÖLTSÉG ÉS A KÉRÉS-KORLÁTOZÁS EGYÜTT JÁR: a tényező emelése önmagában többet
   adna a támadónak (olcsóbb DoS), mint nekünk — a hitelesítési végpontok
   kérés-korlátozása ezért ennek az emelésnek a FELTÉTELE, nem a következménye.

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

   HA A TÉNYEZŐ VÁLTOZIK: a bcrypt a hashbe írja, tehát a RÉGI jelszavak továbbra
   is a régivel ellenőrződnek. Kevert tényezők = felhasználónként eltérő válaszidő,
   azaz visszanyílik ez a szivárgás — és a 10→11 emelés PILLANATÁBAN pontosan ez
   az állapot áll elő: az álca-hash már 11-es (245 ms), a még nem frissített
   jelszavak 10-esek (129 ms), tehát az ismeretlen NÉV ága lassabb, mint a
   létezőé. Ez az átmenet tudatosan vállalt, és rövid: a login.js a KÖVETKEZŐ
   SIKERES BELÉPÉSKOR újrahasheli a jelszót az aktuális tényezővel, tehát
   felhasználónként egyetlen bejelentkezés zárja le. Ezért került az emelés és az
   újra-hashelés UGYANABBA a változtatásba — külön-külön az egyik biztonsági rést
   nyitna, a másik pedig értelmetlen volna. */
const SALT_WORK_FACTOR = 11;
const DUMMY_HASH = bcrypt.hashSync("nincs-ilyen-jelszo", SALT_WORK_FACTOR);

module.exports = {SALT_WORK_FACTOR, DUMMY_HASH};
