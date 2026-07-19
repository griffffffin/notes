import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import MoreTask from "./moreTask";

vi.mock("@fortawesome/react-fontawesome", () => ({FontAwesomeIcon: () => <span/>}));

describe("MoreTask új listaelem", () => {
    it("az új listaelem a legnagyobb kulcs + 1 azonosítót kapja, és a taskOrder végére kerül", () => {
        const todo = {
            tasks: {1: {content: "a", done: false}, 2: {content: "b", done: false}},
            columns: {createColumn: {taskOrder: [1, 2]}},
        };
        const props = {todo, color: "warning", setTodo: vi.fn(), setTask: vi.fn()};
        render(<MoreTask {...props}/>);

        fireEvent.change(screen.getByPlaceholderText("Listaelem"), {target: {value: "új elem"}});

        // A meglévő kulcsok maximuma 2, tehát az új kulcs 3, false (nem kész) állapottal.
        expect(props.setTask).toHaveBeenCalledWith(3, "új elem", false);
        expect(todo.columns.createColumn.taskOrder).toEqual([1, 2, 3]);
    });
});
