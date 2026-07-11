import {Component} from "react";
import Task from "./task";
import {Droppable} from "@hello-pangea/dnd";

class InnerList extends Component {
    shouldComponentUpdate(nextProps, nextState, nextContext) {
        return nextProps.tasks !== this.props.tasks;
    };

    render() {
        return (this.props.tasks.map((task, index) =>
            <Task key={task.id} index={index} todo={this.props.todo} setTodo={this.props.setTodo} task={task}
                  setTaskOrder={this.props.setTaskOrder} setTask={this.props.setTask} color={this.props.color}/>));
    };
}

export default function Column(props) {
    return (
        <div className="d-flex flex-column col input-group">
            <Droppable droppableId={props.column.id} type="task">
                {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                        <InnerList todo={props.todo} setTodo={props.setTodo} tasks={props.tasks}
                                   setTaskOrder={props.setTaskOrder} setTask={props.setTask} color={props.color}/>
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    );
}
