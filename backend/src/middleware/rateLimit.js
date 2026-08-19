/* KÉRÉS-KORLÁTOZÁS (rate limit): mennyi kérést fogadunk el ugyanattól a hívótól
   egy adott időablakban.

   MIÉRT KELL. Egy nyilvános végpont bárkitől bármennyi kérést kaphat. A
   validátor megvédi az ADATOT (rossz alak nem jut le), de nem védi meg a
   GÉPET: tízezer szabályos kérés is elviheti a CPU-t, teleírhatja a naplót, vagy
   — jelszó-végpontnál — végigpróbálhatja a szótárat. A korlátozás azt mondja ki,
   hogy egy hívó egy időablakban hányszor jöhet; a fölötte érkező kérés 429-et kap
   (Too Many Requests), és nem is jut el a controllerig.

   CSÚSZÓABLAK, NEM FIX ABLAK — és ez a különbség itt nem elméleti.

   A FIX ablak az időt szeletekre vágja (12:00–12:15, 12:15–12:30), és minden
   szelet elején nulláról indítja a számlálót. Ebből egy kihasználható rés
   következik: a szelet VÉGÉN és a következő ELEJÉN leadott kérések együtt a
   limit KÉTSZERESÉT engedik át néhány másodperc alatt. Húszas kerettel ez 40
   jelszó-próbálkozás egy szuszra — pont az a burst, ami egy szótár-támadásnak a
   legtöbbet ér, és pont az a pillanatnyi terhelés, amitől a bcrypt a négyszálas
   threadpoolt megfogja.

   A CSÚSZÓ ablak nem szeletel: mindig az UTOLSÓ `windowMs` időtartamra néz
   vissza ("hány kérés jött mostantól visszafelé 15 percig?"). Nincs nullázó
   pillanat, tehát nincs határ-burst sem: a keret bármely 15 perces szakaszra
   érvényes, nem csak a naptár szerintiekre.

   Az ára a több tárolás: nem elég egy számláló, kellenek az ENGEDETT kérések
   IDŐPONTJAI. Ez itt olcsó, mert hívónként legfeljebb `max` időbélyeget tartunk
   (a blokkolt kérést nem jegyezzük fel — így egy flood nem hizlalja a listát, és
   nem is hosszabbítja meg a saját tiltását).

   MEMÓRIÁBAN tartjuk, nem adatbázisban. Egy folyamat fut (egy Pi, egy Node), a
   korlát nem üzleti adat, és az újraindításkori felejtés nem baj. Cserébe a
   Map-et TAKARÍTANI kell, különben minden valaha látott IP örökre bent maradna —
   ez lassú memóriaszivárgás. A takarítás lusta: kérésenként legfeljebb egyszer,
   és csak ha az utolsó takarítás óta eltelt egy teljes ablak.

   AZ AZONOSÍTÁS a `request.ip`-re épül. Ma nincs proxy az app előtt, tehát ez a
   valódi TCP-forrás. Ha egyszer fordított proxy (nginx, Cloudflare) kerül elé, két
   dolgot KELL tenni: `app.set("trust proxy", …)` a helyes lánchosszal, különben
   minden kérés ugyanattól az egy IP-től (a proxytól) látszik érkezni, és a korlát
   az egész világot egyetlen vödörbe teszi. Ez néma hiba: semmi nem jelez, csak
   hirtelen mindenki 429-et kap. A `trust proxy` viszont CSAK proxy mögött
   kapcsolható be: proxy nélkül az X-Forwarded-For fejlécet bárki hamisíthatná,
   és ezzel megkerülné a korlátot. */

/* Az óra ALAPÉRTELMEZETT forrása. A tesztek saját `now`-t adnak át, hogy ne
   kelljen valódi időt várni — az időfüggő tesztek különben vagy lassúak, vagy
   véletlenszerűen buknak. */
const systemClock = () => Date.now();

/**
 * @param {object} options
 * @param {number} options.windowMs   a visszatekintés hossza ezredmásodpercben
 * @param {number} options.max        ennyi kérés fér bele egy ablakba, hívónként
 * @param {string} options.message    a 429 válasz szövege (a felhasználónak szól)
 * @param {() => number} [options.now] óra — a tesztek írják felül
 */
function rateLimit({windowMs, max, message, now = systemClock}) {
    /* A feltevéseket KIMONDJUK: egy elgépelt vagy hiányzó beállítás különben néma
       lenne — egy `undefined` max mellett minden kérés átmenne (a `length < undefined`
       mindig hamis… illetve épp fordítva: sosem engedne), vagyis a korlát csendben
       elromlana valamelyik irányba. */
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("rateLimit: érvénytelen windowMs");
    if (!Number.isFinite(max) || max <= 0) throw new Error("rateLimit: érvénytelen max");

    /* hívó → az ENGEDETT kérései időbélyegei, növekvő sorrendben. Legfeljebb `max`
       elem: ha tele van, a kérés blokkolódik, és nem is kerül bele. */
    const callers = new Map();
    let lastCleanup = now();

    // A `windowMs`-nél régebbi időbélyegek kiesnek: azok már nem számítanak bele.
    const prune = (times, currentTime) => {
        while (times.length && currentTime - times[0] >= windowMs) times.shift();
        return times;
    };

    const cleanup = (currentTime) => {
        if (currentTime - lastCleanup < windowMs) return;
        lastCleanup = currentTime;
        for (const [caller, times] of callers)
            if (prune(times, currentTime).length === 0) callers.delete(caller);
    };

    return (request, response, next) => {
        const currentTime = now();
        cleanup(currentTime);

        /* A `request.ip` hiányozhat (nem HTTP-szerverből hívott middleware, vagy
           lecsatlakozott socket). Ilyenkor NEM engedünk át korlátozás nélkül:
           egyetlen közös vödörbe soroljuk az ismeretleneket. A megengedő ág
           pontosan az a néma kiskapu lenne, amit egy támadó keres. */
        const caller = request.ip ?? "ismeretlen";
        const times = prune(callers.get(caller) ?? [], currentTime);
        callers.set(caller, times);

        if (times.length < max) {
            times.push(currentTime);
            return next();
        }

        /* Mikor szabadul fel hely? Amikor a LEGRÉGEBBI, még számító kérés kicsúszik
           az ablakból. Másodpercben, felfelé kerekítve (a 0 azt jelentené: "azonnal"). */
        const retryAfter = Math.ceil((times[0] + windowMs - currentTime) / 1000);
        response.set("Retry-After", String(Math.max(retryAfter, 1)));
        return response.status(429).json(message);
    };
}

module.exports = rateLimit;
