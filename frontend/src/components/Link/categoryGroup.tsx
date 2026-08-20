import {useEffect, useRef, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import LinkCategory from "./category";
import type {FilterLinkProps} from "./filterLink";
import type {Todo} from "../../types/api";

/* A kattintható terület CSAK a kategória szövege, nem a teljes sor szélessége.

   Ezért nem Bootstrap-sor (.row) tartja őket: a ".row > *" szabály minden
   közvetlen gyerekre width: 100%-ot tesz, amitől a doboz a jobbra igazított
   szöveg mellett balra végig kattintható maradt — a felhasználó a névtől
   méterekre kattintva is kategóriát váltott. A flex-oszlop align-items-end-del
   ugyanúgy jobbra igazít, de a dobozt a tartalmára zsugorítja.

   A térköz szándékosan MARGÓ (me-5) és nem padding: a padding a dobozon BELÜL
   van, tehát kattintható felület lenne — pontosan az, amit el akarunk kerülni.
   A margó kívül esik, így a látvány marad, a találati felület mégis a szövegre
   szűkül. */
export type CategoryGroupProps = {
    /* A felhasználó ÖSSZES kategóriája (a navbar legördülője), nem egy to-dóé —
       ezért tömb a `Todo["category"]`-ból. */
    categories: Todo["category"][];
    /* A lekérés elbukott. Ilyenkor a lista attól még megjelenik (a KORÁBBI, egy
       pillanattal ezelőtti valóság), csak fölé kerül a figyelmeztetés — az első
       betöltésnél viszont a lista üres, és a jelzés nélkül azt állítaná, hogy a
       felhasználónak nincs egyetlen kategóriája sem. */
    categoriesFailed: boolean;
    /* FUT-E ÉPPEN a lekérés. Ez hajtja az újratöltő ikon pörgését — l. lentebb,
       miért nem elég a puszta üzenet. */
    categoriesLoading: boolean;
    /* A bukott lekérés MEGISMÉTLÉSE (app.tsx handleCategoryChange). Kötelező:
       egy jelzés, amiből nincs kiút, fél megoldás — eddig a felhasználó egyetlen
       eszköze az F5 volt, ami viszont az EGÉSZ appot újratölti (nyitott
       legördülők, görgetés, a szerkesztőbe beírt szöveg mind elveszik). */
    onRetry: () => void;
    onClick: FilterLinkProps["onClick"];
};

export default function CategoryGroup(props: CategoryGroupProps) {
    /* PÖRÖG-E AZ IKON. Szándékosan KÜLÖN a `categoriesLoading`-tól: a pörgés a
       lekérés végénél NEM ér véget azonnal, hanem a következő TELJES fordulatnál
       — különben az ikon egy fél fordulatból ugrana vissza alaphelyzetbe, ami
       rándulásnak látszik, nem befejezésnek. */
    const [isSpinning, setIsSpinning] = useState(false);

    useEffect(() => {
        if (props.categoriesLoading) {
            setIsSpinning(true);
            return;
        }
        /* CSÖKKENTETT MOZGÁS mellett a FontAwesome a saját fa-spinjét egyetlen,
           1 ms-os futásra írja át (prefers-reduced-motion) — ilyenkor az
           `animationiteration` SOSEM sül el, tehát a lenti megállító ág nem
           futna le, és a jelző örökre igaz maradna. Nincs is mit végigforgatni:
           a válasz pillanatában állunk meg. Az opcionális hívás a jsdom-nak
           szól, ahol a matchMedia hiányozhat. */
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) setIsSpinning(false);
    }, [props.categoriesLoading]);

    /* A MEGÁLLÁS PONTJA. Az `animationiteration` a fa-spin egy teljes körénél
       (0° → 360°) sül el, tehát pontosan alaphelyzetben — így az ikon nem
       "visszaugrik", hanem ODAÉR. Ha közben új lekérés indult, tovább pörög.

       NATÍV eseménykezelő, nem a React `onAnimationIteration` propja. Ez MÉRT
       döntés: a jsdomban nincs `AnimationEvent` konstruktor, a testing-library
       ezért sima `Event`-et küld, amit a React szintetikus rendszere nem sütt el
       (kipróbálva: natív listener 1 hívás, React-prop 0). A React-propos alak
       böngészőben működne, viszont a megállító ág TESZTELHETETLEN maradna —
       pedig pont ez az az egyetlen sor, amit egy refaktor némán kivehet.

       A figyelő magán az SVG-n ül, nem a gombon: az animációt az viseli. A
       `categoriesFailed` is a függőségek közt van, mert az ikon CSAK hiba esetén
       létezik — nélküle a listener nem kerülne fel, amikor megjelenik. */
    const iconRef = useRef<SVGSVGElement>(null);
    useEffect(() => {
        const icon = iconRef.current;
        if (!icon) return;
        const stopAtFullTurn = () => {
            if (!props.categoriesLoading) setIsSpinning(false);
        };
        icon.addEventListener("animationiteration", stopAtFullTurn);
        return () => icon.removeEventListener("animationiteration", stopAtFullTurn);
    }, [props.categoriesLoading, props.categoriesFailed]);

    return (
        <div className="d-flex flex-column align-items-end pe-5">
            {props.categories.map((category) =>
                <LinkCategory key={category} category={category}
                              class={"pt-0 pb-2 me-5"} onClick={props.onClick}/>)
            }
            {/* A JELZÉS SZÖVEGE ÉS HELYE ATTÓL FÜGG, VAN-E MIT MUTATNI — mert két
                különböző dolog igaz.

                A lekérés EGY kérés, ami a TELJES listát hozza: nem elemenként
                töltünk, tehát "egy kategória" sosem tud külön elbukni. Ha nincs
                semmink, a BETÖLTÉS bukott el, és a legördülő üres marad. Ha van
                korábbi listánk, az látszik — csak azt nem tudjuk, jött-e volna
                hozzá ÚJABB (nulla, egy vagy több): ezért szól "további"
                kategóriákról, és ezért a lista ALÁ kerül, ahol a folytatásuk
                lenne.

                Nem kattintható és nem is látszik annak: sima szöveg, nem
                hivatkozás. */}
            {/* NINCS `small` a soron: az üzenet a kategóriák KÖZÖTT áll, tehát
                velük azonos méretű. A Bootstrap `.small` 0.875em-et adott (mérve:
                14 px a kategóriák 16 px-e mellett), amitől a sor lábjegyzetnek
                látszott — pedig nem az: ez a lista állapotáról szóló közlés, és
                egyben a kiút belőle. Az ikon mérete `em`-ben van megadva
                (index.css), tehát a szöveggel EGYÜTT nő: a vastagság-arány, amit
                a 0.72em-re mértünk, ettől nem csúszik el. */}
            {props.categoriesFailed &&
                <div className="pt-0 pb-2 me-5 text-danger" role="alert">
                    {/* AZ EGÉSZ SOR KATTINTHATÓ — üzenet és ikon egy gombban. A
                        hibajelzés és a kiút belőle egy dolog; külön ikon-célpont
                        telefonon alig eltalálható (l. index.css .category-retry).

                        A `type="button"` KÖTELEZŐ (alapból "submit" lenne): egy
                        űrlapba kerülve elsütné azt (l. a törölt to-do szellemét).
                        A kattintás SZÁNDÉKOSAN nem hívja a handleLinkClicked-et:
                        az becsukná a legördülőt, és a felhasználó pont az
                        EREDMÉNYT nem látná.

                        A gomb NEVE (amit a képernyőolvasó mond) a látható üzenet
                        + egy rejtett kiegészítés: az üzenet önmagában állapot, nem
                        cselekvés — a "gomb: A kategóriák betöltése sikertelen."
                        nem mondaná meg, mi történik kattintásra. Az aria-label
                        rossz volna helyette: az ELNYOMNÁ a látható szöveget.

                        Az ikon-hivatkozás [prefix, név] tömb, nem "fa-solid
                        fa-rotate" osztálynév: a készletünk tree-shakelt, a
                        css-osztályos alak némán üresen jelenne meg (l. app.tsx
                        library.add). */}
                    <button type="button" onClick={props.onRetry}
                            className="category-retry text-danger d-flex align-items-center gap-2">
                        <span>
                            {props.categories.length > 0
                                ? "A további kategóriák betöltése sikertelen."
                                : "A kategóriák betöltése sikertelen."}
                        </span>
                        <span className="visually-hidden">Kattints az újratöltéshez.</span>
                        <FontAwesomeIcon icon={["fas", "rotate"]} spin={isSpinning} ref={iconRef}/>
                    </button>
                </div>}
        </div>
    );
}
