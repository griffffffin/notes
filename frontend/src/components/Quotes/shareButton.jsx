import {useCallback, useEffect, useRef, useState} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";
import {copyToClipboard} from "../../clipboard";
import {publicQuoteUrl} from "./publicQuoteUrl";
import {TOOLTIP_MIDDLEWARES} from "../../tooltipMiddlewares";
import {setTooltipOpen, useTooltipOpen} from "../../tooltipRegistry";

/* Meddig marad a "Másolva" visszajelzés a tooltipben. Elég hosszú, hogy a
   felhasználó elolvassa, elég rövid, hogy ne ragadjon ott. */
const COPIED_FEEDBACK_MS = 1200;

const TOOLTIP_ID = "share-tooltip";

/* MEGOSZTÁS gomb az idézet-szerkesztőben (csak update-nél): megnyomásra a
   szerkesztett idézet PUBLIKUS címét másolja a vágólapra.

   Miért csak update-nél? Mert a publikus cím az idézet AZONOSÍTÓJÁRA épül, az
   pedig a create-nél még nem létezik (csak a mentés hozza létre).

   A gomb SVG, nem <button> — szándékosan, a szomszédos sorszám-/betűméret-
   léptető ikonok mintájára: a szerkesztő egy űrlap, és egy <button> alapból
   `type="submit"`, ami elsütné az űrlapot (l. a törölt to-do "szellemének"
   tanulságát). Az ikon a téma kiemelőszínét viseli (a text-theme osztályból,
   a currentColoron át), tehát szekciónként is együtt vált a többivel. */
export default function ShareButton({author, quoteId}) {
    /* A buborék CSAK a másolás visszajelzésére nyílik ki — nincs "Megosztás"
       súgó hoverre. A hibaágnak is van szövege: a másolás megtagadható (szigorú
       böngésző-beállítás), és a néma kudarc rosszabb, mint a hír.

       A state OBJEKTUM (szöveg + a buborék horgony-pontja), és ez nem csak
       kényelem: minden kattintás ÚJ objektumot állít be, tehát a React biztosan
       újrarajzol, és a lenti effekt is lefut. Puszta szövegnél a második
       kattintás UGYANAZT az értéket állítaná be, amit a React nem tekint
       változásnak — az effekt nem futna, és a buborék nem nyílna ki újra, pedig
       közben becsukhatta más (a "csak egy tooltip lehet nyitva" szabály: elég a
       sorszám-léptető fölé vinni a kurzort). Ez volt a "néha nem reagál a gomb"
       hiba, ezért az objektum-alak itt KÖTELEZŐ, nem ízlés kérdése. */
    const [feedback, setFeedback] = useState(null);
    const timer = useRef(null);
    const icon = useRef(null);
    const isTooltipOpen = useTooltipOpen(TOOLTIP_ID);

    /* Leszereléskor: a függőben lévő visszaállítás ne fusson le a semmibe, és a
       nyilvántartásban se maradjon nyitva egy buborék, aminek már nincs gazdája. */
    useEffect(() => () => {
        clearTimeout(timer.current);
        setTooltipOpen(TOOLTIP_ID, false);
    }, []);

    /* A buborék megnyitása EFFEKTBŐL, tehát egy renderrel a tartalom megjelenése
       UTÁN — nem a kattintás-kezelőből. Nem stílus kérdése: a react-tooltip csak
       akkor mutatja meg a buborékot, ha a tartalma már az előző renderben ott volt;
       ugyanabban a commitban érkező tartalom + nyitás mellett a buborék némán
       zárva maradt (mérve 2026-08-01 az élesen). */
    useEffect(() => {
        setTooltipOpen(TOOLTIP_ID, feedback !== null);
    }, [feedback]);

    const handleClick = useCallback(async () => {
        // A cím az AKTUÁLIS kiszolgálóra mutat (window.location.origin): a házi
        // hálón a Pi címére, netre kerülve a nyilvános domainre — nem kell
        // beégetett cím, és nem is hazudik egyik felállásban sem.
        //
        // A szerző a szerkesztő ÉPPEN AKTUÁLIS (esetleg még nem mentett) értéke.
        // Ez szándékosan nem baj: a publikus nézet a :author szegmenst nem
        // használja a lekérdezéshez (az azonosító egyedi), az csak olvashatóvá
        // teszi a linket — a link tehát mentés előtt is működik.
        const copied = await copyToClipboard(publicQuoteUrl(window.location.origin, author, quoteId));
        /* A buborék HORGONYA egy PONT: az ikon bal széle, függőlegesen középen —
           innen nyílik balra. Miért pont, és nem maga az ikon-elem? Mert a
           react-tooltip csak akkor mutatja meg a buborékot, ha a pozíciója már
           kiszámolt; elem-horgonynál az első megnyitáskor a horgony még nincs
           feloldva, és a buborék NÉMÁN zárva maradt (mérve 2026-08-01: az oldal
           betöltése utáni ELSŐ kattintás sosem jelzett vissza, a második igen).
           Ponttal a számításnak nincs mire várnia — a szerkesztő hibabuboréka is
           így működik, az elsőre is megjelenik. */
        const rect = icon.current.getBoundingClientRect();
        setFeedback({
            text: copied ? "Link másolva." : "Sikertelen másolás.",
            pos: {x: rect.left, y: rect.top + rect.height / 2},
        });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setFeedback(null), COPIED_FEEDBACK_MS);
    }, [author, quoteId]);

    return (<>
        {/* A rajz a "továbbküldés" ívelt nyila. VONALLAL rajzolt ikon (fill nélkül,
            stroke=currentColor), nem kitöltött folttal, mint a Bootstrap-ikonjaink
            — ezért a rajzterülete is 512-es, nem 16-os. A currentColor miatt így is
            a téma színét kapja. */}
        <svg ref={icon} xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 512 512"
             fill="none" stroke="currentColor" strokeWidth="25"
             strokeLinecap="round" strokeLinejoin="round"
             role="button" aria-label="Megosztás"
             style={{cursor: "pointer"}} onClick={handleClick}>
            <path d="M448 256 288 400v-80c-96 0-160 32-224 128 0-160 64-256 224-256V96z"/>
        </svg>

        {/* A buborék BALRA nyílik: alatta közvetlenül a betűméret-léptető ül, egy
            lefelé nyíló tooltip azt takarná el. A middlewares (l.
            tooltipMiddlewares.js) itt is az appban közös készlet.
            A méret a stepper-tooltipekével egyezik (azok fs-4 mérethez képest
            60%-ot kérnek, ami 0,9rem) — külön írjuk ki, hogy ne egy örökölt
            betűméret rejtett mellékhatása legyen.

            A horgony egy PONT (position), nem az ikon-elem — az indoklás a
            kattintás-kezelőnél. Így a buborék nem is hoverre nyílik: nincs
            data-tooltip-id az ikonon, a megjelenítést egyedül a másolás vezérli. */}
        <ReactTooltip id={TOOLTIP_ID} position={feedback?.pos} place="left" isOpen={isTooltipOpen}
                      middlewares={TOOLTIP_MIDDLEWARES} disableStyleInjection={true}
                      border="1px solid var(--theme-accent)"
                      style={{zIndex: 10, backgroundColor: "var(--theme-page-bg)",
                          color: "var(--theme-accent)", fontSize: "0.9rem",
                          userSelect: "none"}}>
            {feedback?.text}
        </ReactTooltip>
    </>);
}
