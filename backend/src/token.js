const jwt = require("jsonwebtoken");

/* A token élettartama SZÁNDÉKOSAN rövid — ez a tétlenségi kijelentkezés lelke.

   Ha csak a böngészőben járna egy időzítő, a FELÜLET nézne kijelentkezettnek,
   de a lemásolt süti a szerveren tovább élne a régi lejáratáig (7 nap volt).
   Így viszont maga a token válik használhatatlanná: negyed óra tétlenség után a
   szerver sem fogadja el többé.

   Munka közben nem dob ki: amíg használod az appot, a kliens csendben megújítja
   (POST /refresh, legfeljebb 5 percenként). A megújítást AKTIVITÁS váltja ki,
   nem az óra — így a token lejárata mindig a legutóbbi tevékenységedhez
   igazodik, és tétlen munkamenetet soha nem hosszabbít meg.

   A 15 perc a kliens tétlenségi határával egyezik (contexts/auth.jsx):
   a kettőt EGYÜTT kell módosítani. */
const TOKEN_TTL = "15m";

const signToken = (id) => jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: TOKEN_TTL});

module.exports = {TOKEN_TTL, signToken};
