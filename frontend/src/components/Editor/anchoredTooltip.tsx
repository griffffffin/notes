import {useEffect, useMemo} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";
import {tooltipMiddlewares} from "../../tooltipMiddlewares";
import {setTooltipOpen, useTooltipOpen} from "../../tooltipRegistry";
import {ACCENT_RED} from "../../contexts/theme-context";
import type {FieldAnchor} from "./fieldAnchor";

/* EGY PONTHOZ HORGONYZOTT BUBORÉK — az app egységes hibajelzése.

   Ez a komponens a MEGJELENÉST és a VISELKEDÉST tartja: lap-háttér, kiemelőszínű
   keret és szöveg, lefelé nyíló hegy, képernyőn belül tartás, és hogy bárhova
   kattintva eltűnik. Azt, hogy MI a szöveg és mikor van hiba, a hívó tudja.

   Miért külön a ValidationTooltiptől: az a kötelező mezők mondatát építi
   ("Az idézet kitöltése kötelező."), tehát egy SZABÁLYT képvisel. Amikor a
   keresősáv is buborékot kapott (a hiba nem a mező tartalmáról szól, hanem a
   művelet kudarcáról), a két üzenetnek egyforma KINÉZETET kellett kapnia, de
   más TARTALMAT. Két hasonló, külön karbantartott buborék előbb-utóbb elcsúszna
   egymástól — ezért a közös rész itt van, egy példányban. */

type AnchoredTooltipProps = {
    /* Egy lapon több buborék is élhet; a react-tooltip id-vel különbözteti meg
       őket, a közös nyilvántartás pedig ezzel zárja be a többit. */
    id: string;
    /* Hova mutasson (null = nincs mit mutatni, a buborék zárva). */
    anchor: FieldAnchor | null;
    message: string;
    /* A "felejtsd el" művelet: a hívó állapotát nullázza. Azért nem intézheti el
       a buborék magában, mert amíg a hívó hibásnak tudja az állapotot, a buborék
       újra kinyílna. */
    onDismiss: () => void;
    /* A SZÍNE. Az alapértelmezett a téma kiemelőszíne — ez a kötelező-mező
       buborékoké: ott a felhasználó még csak nem töltött ki valamit, nem történt
       BAJ. A "red" a valódi hibáé (a keresés nem indult el): az app egyetlen
       pirosa (ACCENT_RED), tehát a felület eddigi nyelvén beszél.

       MIÉRT "red" ÉS NEM "error" (2026-08-19). Kézenfekvő volna a SZEREPPEL
       nevezni, ahogy az "accent" is szerepet nevez — de ez a piros nálunk NEM a
       hiba színe: ugyanez az érték az akcentusa a szerző-szűrt idézet-nézetnek is
       (Link/author.tsx), ahol semmi baj nem történt. Egy "error" név tehát a
       használatainak a felét meghazudtolná. A "danger" ugyanezért volt rossz, és
       ráadásul összekeverhető a Bootstrap `danger` osztályával — ami azóta amúgy is
       EZT a pirosat mutatja (index.css: --bs-danger → --app-red). */
    tone?: "accent" | "red";
};

export default function AnchoredTooltip({id, anchor, message, onDismiss, tone = "accent"}: AnchoredTooltipProps) {
    const isOpen = useTooltipOpen(id);

    /* A buborék a megadott határon belül marad (a szerkesztőben a kártya, a
       navbarban a képernyő). useMemo: a react-tooltip a middleware-lista
       cseréjekor újraszámol, tehát nem adhatunk neki minden renderben új tömböt. */
    const middlewares = useMemo(() => tooltipMiddlewares(anchor?.boundary), [anchor?.boundary]);

    useEffect(() => {
        setTooltipOpen(id, anchor !== null);
    }, [id, anchor]);

    /* BÁRHOVA kattintva eltűnik — pointerdown, CAPTURE fázisban: így akkor is
       elsül, ha a megnyomott elem megállítja az esemény terjedését. */
    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener("pointerdown", onDismiss, true);
        return () => document.removeEventListener("pointerdown", onDismiss, true);
    }, [isOpen, onDismiss]);

    /* A piros AZ APP SAJÁT HIBA-PIROSA (ACCENT_RED), nem a Bootstrapé.

       MÉRVE (2026-08-19): előbb a `var(--bs-danger)`-t használta, ami #dc3545 —
       az viszont MÁS piros, mint amire a felület hibánál vált (#db1937: a
       szerző-szűrt idézet-nézet és a betöltési hiba egész lapos akcentusa).
       Fekete háttéren a kettő szemmel is elválik, a tompább Bootstrap-piros
       ráadásul kevésbé olvasható. Egy hibajelzésnek egy pirosa legyen.

       Az értéket a KÖZÖS konstansból vesszük (theme-context.ts ACCENT_RED), nem
       hexával ideírva: ha a hiba-piros egyszer változik, itt is változik. */
    const accent = tone === "red" ? ACCENT_RED.accent : "var(--theme-accent)";


    return (
        <ReactTooltip id={id} isOpen={isOpen}
                      position={anchor?.pos} place="bottom" middlewares={middlewares}
                      disableStyleInjection={true} border={"1px solid " + accent}
                      style={{zIndex: 20, backgroundColor: "var(--theme-page-bg)",
                          color: accent, userSelect: "none"}}>
            {anchor && message}
        </ReactTooltip>
    );
}
