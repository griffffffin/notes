const router = require("express").Router();
const {signToken} = require("../../token");

/* Friss token a még érvényes token birtokosának.

   Nincs benne ellenőrzés, és ez nem hanyagság: ide csak az auth middleware-en
   át vezet út, az pedig már megnézte az aláírást, a lejáratot ÉS azt, hogy a
   fiók ma is létezik. Aki eljutott idáig, az bizonyítottan bejelentkezett.

   Az azonosító a request.userId-ból jön (a TOKENBŐL), nem a kérés törzséből —
   különben frissítés címén bárki bárkinek a nevére kérhetne tokent. */
module.exports = router.post("/", (request, response) => response.json(signToken(request.userId, request.tokenVersion)));
