import {useMemo} from "react";
import {useParams} from "react-router-dom";
import TodoCard from "./card";
import {useSectionList} from "../CardList/useSectionList";
import CardListView from "../CardList/CardListView";
import type {MouseEventHandler} from "react";
import type {Todo} from "../../types/api";

/* Ugyanaz a komponens szolgálja ki a szűretlen listát és a szűrt nézeteket — a
   különbség az `url`-ben van (/to-dos, /to-dos/category, /to-dos/color). */
type TodoReadProps = {
    url: string;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* A to-do lista. A betöltés + húzás + szekció-emlékezet a useSectionList hookban,
   a megjelenítés (betöltő, üres nézet, rács) a CardListView-ban van — ugyanaz,
   amit az idézet-lista és a keresési találat is használ. Itt csak a
   to-do-SPECIFIKUS rész marad: a szűrő értelmezése és a kártya tartalma. */
export default function Read(props: TodoReadProps) {
    const {name} = useParams();

    /* A szűrő (kategória vagy szín) a :name URL-szegmensből jön. A user
       azonosítója NEM az URL-ből — azt a szerver a tokenből tudja.

       A :name-et a React Router már dekódolva adja (a Link-ek
       encodeURIComponent-tel kódolják). A csupasz /category (:name nélkül) IDE be
       sem jut: a route-ban a :name kötelező, így az ilyen útvonal a "*"-ágra esik,
       ami a listára irányít — külön komponens-őr itt már nem kell. */
    const needsFilter = props.url === "/to-dos/category" || props.url === "/to-dos/color";
    // useMemo, mert az objektum-literál rendernként új referencia lenne, és a hook
    // betöltő effektje függ tőle — memoizálás nélkül minden render újratöltene.
    const filter = useMemo(
        () => (name != null ? (props.url === "/to-dos/color" ? {color: name} : {category: name}) : null),
        [name, props.url],
    );

    /* A `<Todo>` mondja meg, MILYEN kártyákat várunk — innen tudja a CardListView
       és a renderCard is, hogy `todo.color`-t és `todo.category`-t olvashat. */
    const {cards, isLoading, grid} = useSectionList<Todo>({
        url: props.url, filter, reorderUrl: "/to-dos/reorder", section: "/to-dos",
    });

    /* Üres SZŰRT nézet esetén vissza a főlistára (a szűrő kihalt: az utolsó ilyen
       elemet átsorolták vagy törölték). A FŐLISTA legitimen lehet üres, ezért ott
       nincs átirányítás — l. a CardListView indoklását. */
    return (
        <CardListView cards={cards} isLoading={isLoading} grid={grid}
                      emptyRedirect={needsFilter ? "/to-dos" : null}
                      renderCard={(todo) =>
                          <TodoCard todo={todo} handleLinkClicked={props.handleLinkClicked}/>}/>
    );
}
