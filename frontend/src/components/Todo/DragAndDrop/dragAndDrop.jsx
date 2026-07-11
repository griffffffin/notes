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

    const handleDragEnd = useCallback((result) => {
        const {destination, source, draggableId} = result;
        if (!destination) return;
        else if (destination.droppableId === source.droppableId && destination.index === source.index) return;
        const sourceColumn = props.todo.columns["createColumn"];
        const taskOrder = sourceColumn.taskOrder;

        taskOrder.splice(parseInt(source.index), 1);
        taskOrder.splice(parseInt(destination.index), 0, parseInt(draggableId));

        const column = {...sourceColumn, taskOrder: taskOrder};
        const todo = {
            ...props.todo, columns: {
                ...props.todo.columns,
                [column.id]: column
            }
        };
        props.setTodo(todo);
    }, [props]);

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
