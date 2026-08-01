import {beforeEach, describe, expect, it} from "vitest";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {TOOLTIP_MIDDLEWARES, tooltipMiddlewares} from "./tooltipMiddlewares";

/* A tooltip IRÁNYÁT teszteljük telefon-szélességen — vagyis pontosan azt, ami
   élesben elromlott: a kötelező-mező hibabuborék a mező bal széléhez horgonyozva
   nem LEFELÉ, hanem OLDALRA nyílt ki, rá a mezőre.

   Miért lehet ezt jsdomban tesztelni, ha ott nincs elrendezés? Mert nem a
   böngésző elrendezését mérjük, hanem a floating-ui DÖNTÉSÉT: az egy tiszta
   számítás, aminek a bemenete három téglalap (horgony, buborék, képernyő). A
   három téglalapot itt kézzel adjuk meg, tehát a teszt nem függ attól, hogy a
   jsdom nem rajzol.

   A jsdom-nak három dolgot kell pótolnunk:
     - a KÉPERNYŐ mérete: a floating-ui a documentElement clientWidth/Height-jából
       olvassa (jsdomban alapból 0);
     - a BUBORÉK mérete: a floating-ui az offsetWidth/offsetHeight-ra esik vissza,
       ha a computed style nem ad számot (jsdomban ez a helyzet);
     - a HORGONY: ez amúgy is "virtuális elem" (puszta pont) a valódi kódban is —
       a hibabuborék a placeholder közepére horgonyzik, nem elemre. */

// Egy tipikus telefon álló nézete CSS-pixelben (a hibát ekkora nézetben mértük).
const PHONE_WIDTH = 408;
const PHONE_HEIGHT = 856;

/* A hibabuborék mért mérete ("Az idézet kitöltése kötelező.") és a horgony:
   a bal szélhez közeli pont, ahol a placeholder közepe van. A buborék fele
   (102 px) SZÉLESEBB, mint amennyi hely balra van (78 px) — pont ez a kilógás
   indította el a régi kódban az oldalra billenést. */
const BUBBLE_WIDTH = 204;
const BUBBLE_HEIGHT = 36;
const ANCHOR_X = 78;
const ANCHOR_Y = 46;

/* A react-tooltip 6.0.8 SAJÁT alapértelmezése (a könyvtár forrásából másolva) —
   a tesztben azért szerepel, hogy lássuk: a hibát tényleg ez okozta, és a mi
   listánk tényleg mást csinál. Ha a könyvtár egyszer megjavítja magát, ez a
   teszt bukik, és tudni fogjuk, hogy a saját listánk elhagyható. */
const REACT_TOOLTIP_DEFAULTS = [offset(10), flip({fallbackAxisSideDirection: "start"}), shift({padding: 5})];

// A horgony: nulla méretű pont (a react-tooltip a `position` propból ilyet csinál).
const anchorPoint = {
    getBoundingClientRect: () => ({
        x: ANCHOR_X, y: ANCHOR_Y, width: 0, height: 0,
        top: ANCHOR_Y, right: ANCHOR_X, bottom: ANCHOR_Y, left: ANCHOR_X,
    }),
};

let bubble;

beforeEach(() => {
    for (const [prop, value] of [["clientWidth", PHONE_WIDTH], ["clientHeight", PHONE_HEIGHT]]) {
        Object.defineProperty(document.documentElement, prop, {value, configurable: true});
    }
    bubble = document.createElement("div");
    Object.defineProperty(bubble, "offsetWidth", {value: BUBBLE_WIDTH, configurable: true});
    Object.defineProperty(bubble, "offsetHeight", {value: BUBBLE_HEIGHT, configurable: true});
    document.body.appendChild(bubble);
});

const place = (middleware) =>
    computePosition(anchorPoint, bubble, {placement: "bottom", strategy: "absolute", middleware});

describe("tooltip-pozicionálás telefon-szélességen", () => {
    it("a buborék LEFELÉ nyílik akkor is, ha a horgony a képernyő bal széléhez közel van", async () => {
        const {placement} = await place(TOOLTIP_MIDDLEWARES);

        expect(placement).toBe("bottom");
    });

    /* A vízszintes kilógást elcsúsztatással oldjuk meg: a buborék bal széle a
       képernyőn belülre kerül (a shift 8 px-es paddingjával), nem lóg ki. */
    it("a buborék vízszintesen BECSÚSZIK a képernyőre, nem lóg ki", async () => {
        const {x} = await place(TOOLTIP_MIDDLEWARES);

        expect(x).toBeGreaterThanOrEqual(8);
        expect(x + BUBBLE_WIDTH).toBeLessThanOrEqual(PHONE_WIDTH - 8);
    });

    // A nyíl így is a horgonyra mutathat: a buborék TAKARJA a horgony x-ét.
    it("a horgony a becsúsztatott buborék szélessége alatt marad (a nyíl rá tud mutatni)", async () => {
        const {x} = await place(TOOLTIP_MIDDLEWARES);

        expect(ANCHOR_X).toBeGreaterThan(x);
        expect(ANCHOR_X).toBeLessThan(x + BUBBLE_WIDTH);
    });

    /* A HIBA rögzítése: a react-tooltip alapértelmezésével ugyanez a helyzet
       oldalra billen. Ez a teszt a "miért kellett saját lista" bizonyítéka —
       enélkül a tooltipMiddlewares.js egy indoklás nélküli extra fájlnak tűnne. */
    it("a react-tooltip alapértelmezésével ugyanez OLDALRA billenne (ez volt a hiba)", async () => {
        const {placement} = await place(REACT_TOOLTIP_DEFAULTS);

        expect(placement).toBe("right");
    });
});

/* A hibabuborék nem a képernyőhöz, hanem a szerkesztő KÁRTYÁJÁHOZ igazodik: kilógva
   a kártya kiemelőszínű keretét takarta ki (a buborék háttere lapszínű). A kártya a
   telefon-nézetben a szélesség ~90%-a, középre igazítva. */
const CARD_LEFT = 20;
const CARD_WIDTH = 368;

describe("a hibabuborék a szerkesztő kártyáján belül marad", () => {
    let card;

    beforeEach(() => {
        card = document.createElement("div");
        const rect = {x: CARD_LEFT, y: 10, width: CARD_WIDTH, height: 300,
            left: CARD_LEFT, top: 10, right: CARD_LEFT + CARD_WIDTH, bottom: 310};
        card.getBoundingClientRect = () => rect;
        for (const [prop, value] of [["clientWidth", CARD_WIDTH], ["clientHeight", 300],
            ["offsetWidth", CARD_WIDTH], ["offsetHeight", 300]]) {
            Object.defineProperty(card, prop, {value, configurable: true});
        }
        document.body.appendChild(card);
    });

    it("a kártyán belülre csúszik be, nem csak a képernyőre", async () => {
        const {x} = await place(tooltipMiddlewares(card));

        expect(x).toBeGreaterThanOrEqual(CARD_LEFT + 8);
    });

    // Határ nélkül ugyanez a képernyő széléig csúszna — vagyis KI a kártya keretén.
    it("határ nélkül a kártya keretén kívülre kerülne", async () => {
        const {x} = await place(TOOLTIP_MIDDLEWARES);

        expect(x).toBeLessThan(CARD_LEFT);
    });
});
