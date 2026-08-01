import {useCallback, useEffect, useRef} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";
import {TOOLTIP_MIDDLEWARES} from "../../tooltipMiddlewares";
import {useTooltipOpen, useTooltipToggle} from "../../tooltipRegistry";

/* Ennyit vár a léptető két lépés között — ÉS ennyivel később mozdul a kattintásra
   is (a kattintás egyetlen lépése is ezen az időzítőn megy). EGY helyen áll, mert
   a lefelé és a felfelé léptetés ugyanezt az ütemet használja; külön számokként
   némán elcsúszhatnának egymástól. */
export const STEP_DELAY_MS = 100;

export default function Order(props) {
    /* Alapértékek a SORSZÁM-használathoz (to-do + idézet): 1-től, egyesével,
       "Sorszám" tooltip lefelé. A per-idézet BETŰMÉRET-stepper ugyanezt a
       komponenst használja: a léptetés (kattintás/nyomva tartás, ütem) SZÁNDÉKOSAN
       1:1 azonos a sorszáméval — csak a TARTOMÁNY (min 100, max 200) és a FELIRAT
       tér el ("Betűméret" tooltip FELFELÉ). A step-et egyik hívó sem adja meg, így
       mindkettő egyesével lép. A tooltipId külön adható, mert egy oldalon KÉT
       stepper is lehet (a szerkesztőben a sorszám ÉS a betűméret) — azonos id-jű
       tooltipek ütköznének. */
    const min = props.min ?? 1;
    const step = props.step ?? 1;
    const tooltipId = props.tooltipId ?? "order-tooltip";
    /* A súgó nyitottságát a lap KÖZÖS nyilvántartása mondja meg (l. tooltipRegistry):
       egyszerre egy tooltip lehet nyitva, tehát ennek a megnyílása becsukja a
       hibabuborékot és a másik stepper súgóját is. A könyvtár saját hover-eseményei
       a toggle-ön át jutnak el a nyilvántartáshoz. */
    const isTooltipOpen = useTooltipOpen(tooltipId);
    const toggleTooltip = useTooltipToggle(tooltipId);
    /* A felső korlát: ha a hívó megadja a max propot (betűméret: 200), az; különben
       a sorszám-minta last+1-e. A `last` a MEGLÉVŐ elemek száma; az új elem eggyel
       több pozíciót nyit, így a legnagyobb VÁLASZTHATÓ sorszám last+1. (Az új to-do
       alapból az ELSŐ helyre, 1-re kerül — l. a save.jsx useState(1)-ét; a stepper
       viszont felengedi egészen a végére, last+1-re is. L. az order-tesztet.) */
    const max = props.max ?? (props.last + 1);
    /* Két lépés közti idő ezredmásodpercben — ennyivel később mozdul a kattintás, és
       ennyi a nyomva tartás ismétlési üteme. Alap a STEP_DELAY_MS; a hívó felülírhatja
       (a betűméret-stepper feleannyit ad → dupla sebesség). */
    const stepDelay = props.stepDelay ?? STEP_DELAY_MS;

    /* A nyomva tartás ismétlő-időzítője. Ref, mert a lenyomás és az elengedés közt
       kell életben tartani, és a változása NEM járhat újrarajzolással. */
    const timer = useRef(null);
    /* Lépett-e már a mostani lenyomás óta. Ez választja szét a KATTINTÁST a NYOMVA
       TARTÁSTÓL az elengedéskor: kattintásnál (még nem lépett) a függőben lévő
       EGYETLEN lépést hagyjuk lefutni; nyomva tartás után (már lépett) a soron
       következő lépést eldobjuk, hogy elengedés után ne szaladjon tovább. */
    const stepped = useRef(false);
    /* Nyomva tartják-e még. A tick csak akkor ütemez újabb lépést, ha ez igaz —
       így az elengedés (window-figyelő) egyetlen ref-váltással leállítja az
       ismétlést, bárhol is engedték fel az egeret. */
    const holding = useRef(false);
    /* A legfrissebb érték tükre. A tick EBBŐL számol (nem a props.current-ból): a
       gyors ismétlés alatt a props.current egy rendert késhet, a ref viszont a
       lépéssel egyszerre frissül, így nem lép duplát vagy ki a határon. */
    const valueRef = useRef(props.current);
    valueRef.current = props.current;

    const clamp = useCallback((value) => Math.min(max, Math.max(min, value)), [min, max]);

    /* Elengedés — az egész ABLAKRA kötve (l. start), nem csak a gombra. Ez a hiba
       gyökér-javítása: ha az egeret a gombon KÍVÜL engedik fel (a gombról lecsúszva,
       vagy mert a szám 9→10 szélesedésekor a + gomb kicsúszik a kurzor alól), a
       gombra kötött onMouseUp sosem sülne el, és a léptető pörögne tovább — főleg
       fölfelé, ahol nincs közeli határ, ami megállítsa. A window-figyelő bárhol
       elkapja az elengedést. */
    const release = useCallback(() => {
        holding.current = false;
        window.removeEventListener("mouseup", release);
        window.removeEventListener("touchend", release);
        window.removeEventListener("touchcancel", release);
        if (stepped.current && timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    const start = useCallback((event, direction) => {
        // A szintetikus egéresemények kiiktatása touchnál (különben a touchstart utáni
        // kései mousedown másodszor is indítana): a textarea fókusza is megmarad.
        event.preventDefault?.();
        if (timer.current) clearTimeout(timer.current);
        stepped.current = false;
        holding.current = true;
        window.addEventListener("mouseup", release);
        window.addEventListener("touchend", release);
        window.addEventListener("touchcancel", release);

        const tick = () => {
            const next = clamp(valueRef.current + direction * step);
            // Elértük a határt (nincs változás) — állj le, ne pörögjön üresben.
            if (next === valueRef.current) { timer.current = null; return; }
            stepped.current = true;
            valueRef.current = next;
            props.setOrder(next);
            // Csak akkor ütemezz újabb lépést, ha MÉG nyomva tartják. Kattintásnál a
            // holding az elengedéskor már false, tehát pontosan egyszer lép.
            timer.current = holding.current ? setTimeout(tick, stepDelay) : null;
        };
        timer.current = setTimeout(tick, stepDelay);
    }, [clamp, step, stepDelay, props, release]);

    const handleMinusDown = useCallback((event) => start(event, -1), [start]);
    const handlePlusDown = useCallback((event) => start(event, 1), [start]);

    // Leszereléskor: függőben lévő időzítő + window-figyelők eltakarítása.
    useEffect(() => release, [release]);

    /* A sorszám-toolbar a TÉMA színeit viseli (nem a to-do sajátját): a háttere a
       lap háttere (bg-theme-page), a szám és a gombok a kiemelőszínt (text-theme;
       a gombok fill=currentColor ebből veszik). */
    return (
        <div className="card-header no-focus bg-theme-page fs-4 user-select-none pe-2 text-theme flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-dash-circle me-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handleMinusDown} onTouchStart={handleMinusDown}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
            </svg>
            {/* tabular-nums: minden számjegy AZONOS szélességű (mint egy
                táblázatban), így a szám szélessége csak a jegyek SZÁMÁTÓL függ,
                a konkrét számjegyektől nem — 1 és 8 egyforma helyet foglal. Enélkül
                a keskeny és széles számjegyek váltogatták a szélességet, és attól
                ugrált a + gomb. Az inline-block + text-align a számot a két gomb
                közé középre igazítja. (A jegyszám VÁLTOZÁSA — 9→10 — még szélesít
                egyet, de az ritka és logikus.) */}
            <span data-tooltip-id={tooltipId}
                  style={{fontVariantNumeric: "tabular-nums", display: "inline-block", textAlign: "center"}}>
                {props.current}
            </span>
            {/* A CSS-t a main.jsx importálja statikusan (disableStyleInjection).
                z-index 10: a react-tooltip alapértéke 1, ami a fókuszált input
                (Bootstrap: 5) alá esne.

                A háttér/szöveg a TÉMA színeit viseli (mint a sorszám-toolbar), a
                react-tooltip alapértelmezett szürke háttere + fehér szövege
                helyett: háttér a lap (--theme-page-bg), szöveg és keret a
                kiemelőszín (--theme-accent). A színeket inline adjuk, mert a
                react-tooltip a saját (injektálatlan) stílusát tenné rá.

                A middlewares (l. tooltipMiddlewares.js) az egész appban közös: a
                buborék KERESZTirányú kilógástól nem billenhet át oldalra, csak
                elcsúszik. Ez a stepper a kártya JOBB széléhez tapad, tehát a
                telefon jobb szélén ugyanaz fenyegetné, ami a hibabuborékot a
                balon utolérte. */}
            {/* clickable NINCS (szándékosan): a súgó puszta felirat, nincs rajta mit
                megnyomni, viszont RÁLÓG a szomszédaira — a "Betűméret" buborék felfelé
                nyílva pontosan a fölötte ülő megosztás-gombra esik. Kattinthatóként
                elnyelné az oda szánt kattintást (mérve 2026-08-01: a gomb "néha nem
                reagált"), így viszont a kattintás átmegy rajta. */}
            <ReactTooltip id={tooltipId} place={props.tooltipPlace ?? "bottom"}
                          middlewares={TOOLTIP_MIDDLEWARES}
                          isOpen={isTooltipOpen} setIsOpen={toggleTooltip}
                          disableStyleInjection={true}
                          border="1px solid var(--theme-accent)"
                          style={{zIndex: 10, backgroundColor: "var(--theme-page-bg)",
                                  color: "var(--theme-accent)", fontSize: "60%"}}>
                {props.tooltip ?? "Sorszám"}
            </ReactTooltip>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-plus-circle ms-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handlePlusDown} onTouchStart={handlePlusDown}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1
                        0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
        </div>
    );
}
