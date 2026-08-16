import {Tooltip as ReactTooltip} from "react-tooltip";
import {useTheme} from "../../../contexts/theme-context";
import {TOOLTIP_MIDDLEWARES} from "../../../tooltipMiddlewares";
import {useTooltipOpen, useTooltipToggle} from "../../../tooltipRegistry";

export default function Tooltip() {
    const {color, colorHex, pageBackground} = useTheme();
    // Egyszerre egy tooltip lehet nyitva a lapon (l. tooltipRegistry).
    const isOpen = useTooltipOpen("tooltip");
    const toggle = useTooltipToggle("tooltip");

    return (<>
        {/* A tabIndex SZÁM, nem szöveg (l. Button/submitButtonGroup.tsx): a -1 azt
            jelenti, hogy az ikon Tab-bal nem érhető el — a súgó tartalma amúgy is
            ott áll a jelszó-szabályban, nem billentyűzet-navigáció célpontja. */}
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" tabIndex={-1}
             className={"bi bi-info-circle no-focus mb-1 text-" + color} data-tooltip-id="tooltip"
             viewBox="0 0 16 16">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808
            1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93
            6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
        </svg>
        {/* A CSS-t a main.tsx importálja statikusan, ezért itt kikapcsoljuk a
            futásidejű injektálást — abból a stíluslapból jön a position:absolute
            is, ami nélkül a z-index hatástalan lenne (z-index csak pozicionált
            elemen működik).
            z-index 10: a react-tooltip alapértéke 1, ami a fókuszált input
            (Bootstrap: 5) és a szem-gomb (6) alá esne.

            A middlewares (l. tooltipMiddlewares.ts) az egész appban közös: telefonon
            se billenhessen át a buborék oldalra, csak csússzon beljebb. Ez a súgó ma
            elfér (408 px-es nézetben mérve), de a szabály attól közös, hogy a szöveg
            hosszabbra írása se törhesse el némán.

            clickable NINCS (szándékosan, mint a léptető-súgókon): a buborék puszta
            felirat, nincs rajta mit megnyomni, viszont RÁLÓG az alatta lévő
            jelszó-mezőre. Kattinthatóként elnyelné az oda szánt kattintást; így a
            kattintás átmegy rajta, és a mezőbe kerül a kurzor. */}
        <ReactTooltip id="tooltip" place="bottom" disableStyleInjection={true}
                      middlewares={TOOLTIP_MIDDLEWARES} isOpen={isOpen} setIsOpen={toggle}
                      border={"1px solid " + colorHex}
                      style={{backgroundColor: pageBackground, color: colorHex, zIndex: 10,
                          userSelect: "none"}}>
            A jelszó legalább <br/>8 karakter legyen.<br/>Kis-, nagybetűkből <br/>és számokból álljon.
        </ReactTooltip>
    </>);
}
