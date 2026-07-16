import {useNavigate} from "react-router-dom";

/* A kártya tartalma. SZÁNDÉKOSAN nincs benne <a> elem — pedig a szerkesztőre
   visz, tehát kézenfekvő lenne linknek megírni.

   Az <a href> ugyanis a húzással összeegyeztethetetlen. Egy horgony a
   böngésző szemében "megfogható és eldobható dolog", és bármelyik úton
   (beépített link-húzás, alapértelmezett navigáció, egy elszalasztott
   kattintás) TELJES oldalbetöltést indíthat a /update-re. Az pedig már nem
   React Router-navigáció: nincs mellette a navigációs state, ami az
   azonosítót viszi — a Save őre ilyenkor joggal dob vissza a főoldalra. Kívülről
   ez úgy néz ki, mintha a kártya áthelyezése újratöltené a lapot.

   Kattintásra tehát magunk navigálunk. Hozzáférhetőségben nem veszítünk: a
   kártyát a dnd-kit amúgy is role="button"-ként adja ki (read.jsx), nem
   linkként. Cserébe a középső egérgombos "új lapon megnyitás" elmarad — az az
   URL-alapú útvonalakkal jön majd vissza (/update/:id), amikor a kategória-
   bővítéssel átszabjuk a route-táblát. */
export default function TodoUpdate(props) {
    const navigate = useNavigate();

    const handleClick = () => {
        props.handleLinkClicked();
        navigate("/update", {state: {id: props.todo._id}});
    };

    return (
        /* Nincs role: a KÜLSŐ doboz (SortableCard) a dnd-kittől role="button"-t
           kap, tehát a kártya egésze már gombként van kihirdetve. Egy belső
           role="presentation" itt kifejezetten rossz lenne: azt jelenti, "engem
           hagyj figyelmen kívül", miközben az elem kattintható. */
        <div onClick={handleClick} className="text-decoration-none">
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
        </div>
    );
}
