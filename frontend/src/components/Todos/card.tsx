import LinkTodoUpdate from "../Link/todoUpdate";
import LinkCategory from "../Link/category";
import type {MouseEventHandler} from "react";
import type {Todo} from "../../types/api";

/* Ugyanaz a kezelő megy a kártya TARTALMÁRA és a lábléc kategória-linkjére is
   (mindkettő <a>), ezért egyetlen, horgony-eseményre szabott típus. */
type TodoCardProps = {
    todo: Todo;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* Egy to-do-kártya tartalma: felül a cím + listaelemek (a szerkesztőre visz),
   alul a kategória lábléce (a kategória-szűrt nézetre visz). Az idézet
   QuoteCard-jának párja — a kártya kinézete egy helyen él, nem a lista-nézet
   JSX-ébe ágyazva.

   ELTÉRÉS az idézet-kártyától: a to-do a SAJÁT színét viseli (a felhasználó
   választja kártyánként), nem a témáét — ezért megy a `todo.color` a keretre, a
   szövegre és a láblécre is. Az idézetnek nincs saját színe. */
export default function TodoCard({todo, handleLinkClicked}: TodoCardProps) {
    return (
        <div className={"card bg-transparent border-2 border-" + todo.color}>
            <LinkTodoUpdate todo={todo} handleLinkClicked={handleLinkClicked}/>
            <LinkCategory category={todo.category} color={todo.color} onClick={handleLinkClicked}
                          class={"card-footer small text-center bg-transparent mx-2 border-" + todo.color}/>
        </div>
    );
}
