import type {MouseEventHandler} from "react";
import {Link} from "react-router-dom";
import type {Todo} from "../../types/api";
import {PATHS} from "../../paths";

/* A kártya tartalma, ami a szerkesztőre visz — ezért VALÓDI link.

   Link, és nem kattintás-kezelős doboz: így a böngésző is tudja, hogy ez egy
   célpont. Látszik a cím az állapotsorban, működik a középső gombos "új lapon
   megnyitás" és a jobb gombos menü, a képernyőolvasó pedig linkként hirdeti ki.
   Egy onClick-es <div> ezt mind eldobná.

   A húzással a rács kattintás-elnyelője békíti össze (read.tsx): a felengedés
   után érkező kattintást elnyeli, ha közben húzás történt, így a link
   navigációja nem indul el. A jelző SZÁNDÉKOSAN a rácson ül és nem itt: az a
   kattintás nem feltétlenül azon a kártyán landol, amit húztunk — a szomszédra
   is eshet, ha a lista közben átrendeződött alatta. */
type LinkTodoUpdateProps = {
    todo: Todo;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

export default function TodoUpdate(props: LinkTodoUpdateProps) {
    /* A listaelemek KÉT mezőből állnak össze: a sorrend (taskOrder) és a tartalom
       (tasks). A szerződés szerint MINDKETTŐ hiányozhat — listaelem nélküli to-do
       teljesen érvényes. Eddig csak a sorrend meglétét néztük, a tartalomét nem:
       ha egy to-dón sorrend van, tartalom viszont nincs (megszakadt mentés, kézi
       adatjavítás), a `tasks[order].done` futásidejű hibával vitte volna az egész
       listát. A típusellenőrzés hozta elő; a két mezőt együtt kell vizsgálni. */
    const {tasks, taskOrder} = props.todo;

    return (
        /* Az azonosító az URL-ben utazik (/update/:id) a szerkesztőnek; enélkül a
           route (:id kötelező) nem is illeszkedne, a "*"-ág a listára dobna vissza.
           A kódolást a builder intézi (paths.ts): az _id 24 jegyű hex ObjectId,
           nincs benne kódolandó karakter, de a szabály nem kivételezik — így nem
           kell minden hívási helyen külön eldönteni, kell-e. */
        <Link to={PATHS.todoUpdate(props.todo._id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            <div className={"card-header caveat bg-transparent no-focus ms-1 text-" + props.todo.color}>
                <div className="float-end ms-1">{props.todo.percentage}%</div>
                {props.todo.title}
            </div>
            <div className="card-body py-1">
                {/* A `taskOrder` (sorrend) és a `tasks` (tartalom) KÉT KÜLÖN
                    szerkezet ugyanarról az alsorlistáról — semmi nem garantálja,
                    hogy fedik egymást: egy régi mentés, egy félbemaradt törlés
                    vagy egy kézzel javított rekord után a sorrendben ott lehet
                    olyan azonosító, amihez már nincs alsor. Eddig ez `undefined`-ra
                    olvasást jelentett (néma összeomlás renderelés közben); most a
                    hiányzó alsort egyszerűen kihagyjuk. */}
                {tasks != null && taskOrder != null && taskOrder.map((order) => {
                    const task = tasks[order];
                    if (!task) return null;
                    return (
                        <div key={order.toString()}>
                            <div className={task.done ?
                                "text-decoration-line-through caveat text-" + props.todo.color :
                                "caveat text-" + props.todo.color}>
                                {task.content}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Link>
    );
}
