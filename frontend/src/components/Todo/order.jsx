import {useCallback, useEffect, useRef, useState} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";

export default function Order(props) {
    const [plusDown, setPlusDown] = useState(false);
    const [minusDown, setMinusDown] = useState(false);
    /* Lépett-e már a mostani lenyomás óta — az időzítő takarítása ettől függ
       (lásd lent). Ref és nem state: a változása NEM járhat újrarajzolással,
       különben újraindítaná azt az effektet, amit épp szabályoz. */
    const hasStepped = useRef(false);

    const handleMinusDown = useCallback(() => {
        hasStepped.current = false;
        setMinusDown(true);
    }, []);
    const handleMinusUp = useCallback(() => setMinusDown(false), []);
    const handlePlusDown = useCallback(() => {
        hasStepped.current = false;
        setPlusDown(true);
    }, []);
    const handlePlusUp = useCallback(() => setPlusDown(false), []);

    /* Az időzítő takarítása FELTÉTELES, és ez szándékos.

       A léptetés úgy működik, hogy a lenyomás 200 ms-mal későbbre ütemez egy
       lépést; a lépés után a szülő új props-t ad, amitől az effekt újraindul és
       ütemezi a következőt — ez adja az ismétlést.

       KATTINTÁSNÁL (200 ms-nál rövidebb nyomás) az elengedés még az első lépés
       ELŐTT jön, tehát a függőben lévő időzítő adja az EGYETLEN lépést. Ha azt
       feltétel nélkül eldobnánk, a kattintás nem csinálna semmit — a léptető
       megszűnne működni. A feltétel nélküli takarítás kézenfekvőbbnek látszik,
       és pont ezért veszélyes: némán megölné a kattintást, miközben a nyomva
       tartás továbbra is hibátlanul menne.

       NYOMVA TARTÁS után viszont a soron következő időzítőt el KELL dobni,
       különben elengedés után még egyet lép: 8-ról indulva, 3-nál elengedve
       2 lett belőle.

       A kettőt a hasStepped választja szét: csak azt az időzítőt állítjuk le,
       ami egy már megkezdett ismétlés folytatása lenne. */
    useEffect(() => {
        if (plusDown || !minusDown || props.current <= 1) return;
        const timer = setTimeout(() => {
            hasStepped.current = true;
            props.setOrder(props.current - 1);
        }, 200);
        return () => {
            if (hasStepped.current) clearTimeout(timer);
        };
    }, [plusDown, minusDown, props]);

    useEffect(() => {
        if (!plusDown || minusDown || props.last < props.current) return;
        const timer = setTimeout(() => {
            hasStepped.current = true;
            props.setOrder(props.current + 1);
        }, 200);
        return () => {
            if (hasStepped.current) clearTimeout(timer);
        };
    }, [plusDown, minusDown, props]);

    return (
        <div className={"card-header no-focus bg-transparent fs-4 user-select-none pe-2 text-" + props.color}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-dash-circle me-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handleMinusDown} onMouseUp={handleMinusUp}
                 onTouchStart={handleMinusDown} onTouchEnd={handleMinusUp}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
            </svg>
            <span data-tooltip-id="order-tooltip">{props.current}</span>
            {/* A CSS-t a main.jsx importálja statikusan (disableStyleInjection).
                z-index 10: a react-tooltip alapértéke 1, ami a fókuszált input
                (Bootstrap: 5) alá esne. */}
            <ReactTooltip id="order-tooltip" className={"border-" + props.color} place="bottom" clickable={true}
                          disableStyleInjection={true}
                          border={"1px solid " + props.colorHex} style={{zIndex: 10}}>
                Sorszám
            </ReactTooltip>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-plus-circle ms-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handlePlusDown} onMouseUp={handlePlusUp}
                 onTouchStart={handlePlusDown} onTouchEnd={handlePlusUp}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1
                        0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
        </div>
    );
}
