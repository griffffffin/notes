import {useEffect, useMemo} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";
import {tooltipMiddlewares} from "../../tooltipMiddlewares";
import {setTooltipOpen, useTooltipOpen} from "../../tooltipRegistry";
import type {FieldAnchor} from "./fieldAnchor";

/* Az `id` PROP (nem konstans): egy lapon több hibabuborék is élhet (a to-do és az
   idézet-szerkesztőé), a react-tooltip id-vel különbözteti meg őket. A `validation`
   a szerkesztő state-je: `null` = nincs hiba, egyébként a fieldAnchor visszatérése.
   Az `onDismiss` a "felejtsd el a hibát" művelet (a validation nullázása). */
type ValidationTooltipProps = {
    id: string;
    validation: FieldAnchor | null;
    onDismiss: () => void;
};

/* A magyar határozott névelő a mezőnév KEZDŐBETŰJÉBŐL: magánhangzó → "Az",
   egyébként "A". Az ékezetes magánhangzók is benne vannak (idézet, ábra, ütem…);
   a hosszú párokat külön fel kell sorolni, a regex nem normalizál. */
const STARTS_WITH_VOWEL = /^[aáeéiíoóöőuúüű]/i;

/* A kötelező-mező hibabuborék — a NATÍV böngésző-buborék helyett, mert azt nem
   lehet stílusozni. A "Sorszám" tooltip kinézetét viseli: lap-háttér, kiemelőszínű
   keret és szöveg. A pozíciót a fieldAnchor méri ki (a placeholder közepe),
   place=bottom-mal a nyíl a placeholder ALÁ esik.

   Az `onDismiss` a buborék ELTŰNTETÉSÉT azért nem intézheti el magában, mert amíg
   a szerkesztő hibásnak tudja a mezőt (a `validation` nem null), a buborék újra
   kinyílna — a hibát a szerkesztőnek kell "elfelejtenie".

   A middlewares (l. tooltipMiddlewares) itt a LEGFONTOSABB: ez a buborék egy
   PONTRA horgonyzik (a placeholder közepére), nem elemre, ezért telefon-szélességen
   a bal képernyőszélhez kerül közel — a react-tooltip alapbeállításával ilyenkor
   oldalra, a mezőre nyílt ki. */
export default function ValidationTooltip({id, validation, onDismiss}: ValidationTooltipProps) {
    const isOpen = useTooltipOpen(id);

    /* A buborék a szerkesztő KÁRTYÁJÁN belül marad (a fieldAnchor a mező űrlapját
       adja határnak) — enélkül kilógna, és lapszínű hátterével kitakarná a kártya
       keretét. useMemo: a react-tooltip a middleware-lista cseréjekor újraszámol,
       tehát nem adhatunk neki minden renderben új tömböt. */
    const middlewares = useMemo(() => tooltipMiddlewares(validation?.boundary), [validation?.boundary]);

    /* A buborék nyitása/zárása a KÖZÖS nyilvántartáson át megy (l. tooltipRegistry):
       így a megnyílása becsukja a többi tooltipet, és fordítva is — ha a felhasználó
       egy léptető súgóját nyitja meg, ez a buborék tűnik el. */
    useEffect(() => {
        setTooltipOpen(id, validation !== null);
    }, [id, validation]);

    /* BÁRHOVA kattintva eltűnik. Miért kell ez, ha a mező gépelésre amúgy is
       nullázza a hibát? Mert a felhasználó nem feltétlenül gépel: ha csak
       félretenné a buborékot, ne ragadjon a képernyőn.

       Nincs "a buborékra kattintva maradjon" kivétel, és nem is lehet: a buborék
       — az app többi tooltipjével egységesen — NEM clickable, tehát
       `pointer-events: none`-t visel, és a rajta ejtett kattintás valójában az
       ALATTA lévő mezőt éri. Ez egyben a kívánt viselkedés: egyetlen kattintás
       eltünteti a hibajelzést ÉS a mezőbe teszi a kurzort.

       pointerdown (nem click) és a CAPTURE fázisban: így akkor is elsül, ha a
       megnyomott elem maga megállítja az esemény terjedését, és nem várunk az
       elengedésig. */
    useEffect(() => {
        if (!isOpen || !onDismiss) return;
        document.addEventListener("pointerdown", onDismiss, true);
        return () => document.removeEventListener("pointerdown", onDismiss, true);
    }, [isOpen, onDismiss]);

    return (
        <ReactTooltip id={id} isOpen={isOpen}
                      position={validation?.pos} place="bottom" middlewares={middlewares}
                      disableStyleInjection={true} border="1px solid var(--theme-accent)"
                      style={{zIndex: 20, backgroundColor: "var(--theme-page-bg)",
                          color: "var(--theme-accent)", userSelect: "none"}}>
            {validation &&
                `${STARTS_WITH_VOWEL.test(validation.name) ? "Az" : "A"} ` +
                `${validation.name} kitöltése kötelező.`}
        </ReactTooltip>
    );
}
