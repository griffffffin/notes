import {PureComponent, useCallback} from "react";
import Column from "./column";
import {DragDropContext} from "@hello-pangea/dnd";

class InnerList extends PureComponent {
    render() {
        const {column, taskMap, index} = this.props;
        const tasks = column.taskOrder.map(taskId => taskMap[taskId]);
        return <Column column={column} index={index} todo={this.props.todo} setTodo={this.props.setTodo} tasks={tasks}
                       setTaskOrder={this.props.setTaskOrder} setTask={this.props.setTask} color={this.props.color}/>;
    };
}

export default function DragAndDrop(props) {
    /* Itt a useCallback-nek VAN értelme: a DnD-fában PureComponent és
       shouldComponentUpdate is van, azoknak stabil függvény kell.
       A függőség ezért a konkrét értékekre hivatkozik — a régi [props] hatástalan
       volt, mert a props objektum minden rendernél új. */
    const {todo, setTodo} = props;

    const handleDragEnd = useCallback((result) => {
        const {destination, source, draggableId} = result;
        if (!destination) return;
        else if (destination.droppableId === source.droppableId && destination.index === source.index) return;
        const sourceColumn = todo.columns["createColumn"];
        const taskOrder = sourceColumn.taskOrder;

        taskOrder.splice(parseInt(source.index), 1);
        taskOrder.splice(parseInt(destination.index), 0, parseInt(draggableId));

        const column = {...sourceColumn, taskOrder: taskOrder};
        setTodo({
            ...todo, columns: {
                ...todo.columns,
                [column.id]: column
            }
        });
    }, [todo, setTodo]);

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="input-group">
                {props.todo.columnOrder.map((columnId, index) => {
                    const column = props.todo.columns[columnId];
                    return <InnerList key={column.id} column={column} taskMap={props.todo.tasks} index={index}
                                      todo={props.todo} setTodo={props.setTodo}
                                      setTaskOrder={props.setTaskOrder} setTask={props.setTask} color={props.color}/>;
                })}
            </div>
        </DragDropContext>
    );
}
