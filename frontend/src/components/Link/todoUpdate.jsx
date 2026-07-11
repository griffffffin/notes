import {Link} from "react-router-dom";

export default function TodoUpdate(props) {
    return (
        <Link to="/update" state={{id: props.todo._id}} className="text-decoration-none"
              onClick={props.handleLinkClicked}>
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
