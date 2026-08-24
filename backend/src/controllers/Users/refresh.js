const router = require("express").Router();
const {signToken} = require("../../token");
const {setTokenCookie} = require("../../tokenCookie");

/* Friss token a még érvényes token birtokosának.

   Nincs benne ellenőrzés, és ez nem hanyagság: ide csak az auth middleware-en
   át vezet út, az pedig már megnézte az aláírást, a lejáratot ÉS azt, hogy a
   fiók ma is létezik. Aki eljutott idáig, az bizonyítottan bejelentkezett.

   Az azonosító a request.userId-ból jön (a TOKENBŐL), nem a kérés törzséből —
   különben frissítés címén bárki bárkinek a nevére kérhetne tokent. */
module.exports = router.post("/", (request, response) => {
    /* A FRISS TOKEN IS SÜTIBE MEGY, ugyanazokkal a jelzőkkel — a böngésző a régit
       felülírja. A válasz törzse ezért üres marad: nincs mit átadni a
       JavaScriptnek, és ami nincs a törzsben, azt nem is lehet félreértelmezni. */
    setTokenCookie(request, response, signToken(request.userId, request.tokenVersion));
    return response.json({name: request.userName});
});
