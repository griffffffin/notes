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
    onClick: FilterLinkProps["onClick"];
};

export default function CategoryGroup(props: CategoryGroupProps) {
    return (
        <div className="d-flex flex-column align-items-end pe-5">
            {props.categories.map((category) =>
                <LinkCategory key={category} category={category}
                              class={"pt-0 pb-2 me-5"} onClick={props.onClick}/>)
            }
        </div>
    );
}
