import {useEffect, useMemo} from "react";
import {Navigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import LinkTodoUpdate from "../Link/todoUpdate";
import LinkCategory from "../Link/category";
import {useAuth} from "../../contexts/auth";
import {useSortableCards} from "../CardList/useSortableCards";
import SortableCardGrid from "../CardList/SortableCardGrid";

/* A to-do lista. A betöltés + húzás közös gépezetét a useSortableCards hook és a
   SortableCardGrid komponens adja (ugyanazt használja az idézet-lista is); itt
   csak a to-do-SPECIFIKUS rész marad: a szűrő értelmezése (kategória/szín), az
   őrök, és a kártya TARTALMA (renderCard). */
export default function Read(props) {
    const {name} = useParams();
    const {handleAxios} = useAuth();

    /* A szűrő (kategória vagy szín) a :name URL-szegmensből jön. A user
       azonosítója NEM az URL-ből — azt a szerver a tokenből tudja.

       A :name-et a React Router már dekódolva adja (a Link-ek
       encodeURIComponent-tel kódolják). Az őr (missingFilter) a csupasz /category
       útvonalat fedi, ami a "*"-ra esne — olcsó, explicit védelem. */
    const needsFilter = props.url === "/to-do/category" || props.url === "/to-do/color";
    // useMemo, mert az objektum-literál rendernként új referencia lenne, és a hook
    // betöltő effektje függ tőle — memoizálás nélkül minden render újratöltene.
    const filter = useMemo(
        () => (name != null ? (props.url === "/to-do/color" ? {color: name} : {category: name}) : null),
        [name, props.url],
    );
    const missingFilter = needsFilter && !filter;

    const {cards, isLoading, ...grid} = useSortableCards({
        url: props.url, filter, reorderUrl: "/to-do/reorder", handleAxios, skip: missingFilter,
    });

    // A gyökér-átirányítás ide tér vissza: jelöljük, hogy a to-do az utolsó
    // megnyitott szekció (a szűrt nézetek is a /to-do gyökérre mutatnak).
    useEffect(() => {
        localStorage.setItem("lastSection", "/to-do");
    }, []);

    // Szűrő nélküli szűrt nézet: nincs mit listázni, vissza a főoldalra (replace,
    // hogy a zsákutca ne kerüljön az előzményekbe).
    if (missingFilter) return <Navigate to="/to-do" replace/>;

    /* ÜRES szűrt nézet: a szűrő nem ad találatot — jellemzően mert az utolsó ilyen
       elemet átsorolták vagy törölték. A kihalt szűrt nézet zsákutca, ezért vissza
       a főlistára. A FŐLISTA (needsFilter false) ellenben LEGITIMEN lehet üres. A
       cards betöltéskor undefined, arra az Array.isArray hamis — nem lövünk korán. */
    if (needsFilter && Array.isArray(cards) && cards.length === 0)
        return <Navigate to="/to-do" replace/>;

    if (isLoading) return <Spinner class="min-vh-75"/>;

    return (
        <SortableCardGrid cards={cards} {...grid} renderCard={(todo) =>
            <div className={"card bg-transparent border-2 border-" + todo.color}>
                <LinkTodoUpdate todo={todo} handleLinkClicked={props.handleLinkClicked}/>
                <LinkCategory category={todo.category} color={todo.color}
                              onClick={props.handleLinkClicked}
                              class={"card-footer small text-center bg-transparent mx-2 border-" + todo.color}/>
            </div>
        }/>
    );
}
