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
    onClick: FilterLinkProps["onClick"];
};

export default function CategoryGroup(props: CategoryGroupProps) {
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
            {props.categoriesFailed &&
                <div className="pt-0 pb-2 me-5 small text-danger" role="alert">
                    {props.categories.length > 0
                        ? "A további kategóriák betöltése sikertelen."
                        : "A kategóriák betöltése sikertelen."}
                </div>}
        </div>
    );
}
