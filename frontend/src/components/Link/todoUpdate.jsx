import {Link} from "react-router-dom";

/* A kártya tartalma, ami a szerkesztőre visz — ezért VALÓDI link.

   Link, és nem kattintás-kezelős doboz: így a böngésző is tudja, hogy ez egy
   célpont. Látszik a cím az állapotsorban, működik a középső gombos "új lapon
   megnyitás" és a jobb gombos menü, a képernyőolvasó pedig linkként hirdeti ki.
   Egy onClick-es <div> ezt mind eldobná.

   A húzással a rács kattintás-elnyelője békíti össze (read.jsx): a felengedés
   után érkező kattintást elnyeli, ha közben húzás történt, így a link
   navigációja nem indul el. A jelző SZÁNDÉKOSAN a rácson ül és nem itt: az a
   kattintás nem feltétlenül azon a kártyán landol, amit húztunk — a szomszédra
   is eshet, ha a lista közben átrendeződött alatta. */
export default function TodoUpdate(props) {
    return (
        /* Az azonosító az URL-ben utazik (/update/:id) a szerkesztőnek; enélkül a
           route (:id kötelező) nem is illeszkedne, a "*"-ág a listára dobna vissza.
           Az _id 24 jegyű hex ObjectId, nincs benne kódolandó karakter, de a
           konzisztenciáért itt is encodeURIComponent-et használunk. */
        <Link to={"/to-dos/update/" + encodeURIComponent(props.todo._id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            <div className={"card-header caveat bg-transparent no-focus ms-1 text-" + props.todo.color}>
                <div className="float-end ms-1">{props.todo.percentage}%</div>
                {props.todo.title}
            </div>
            <div className="card-body py-1">
                {props.todo.taskOrder != null && props.todo.taskOrder.map((order) =>
                    <div key={order.toString()}>
                        <div className={props.todo.tasks[order].done ?
                            "text-decoration-line-through caveat text-" + props.todo.color :
                            "caveat text-" + props.todo.color}>
                            {props.todo.tasks[order].content}
                        </div>
                    </div>)}
            </div>
        </Link>
    );
}
