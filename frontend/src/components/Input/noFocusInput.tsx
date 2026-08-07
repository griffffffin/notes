import type {ChangeEventHandler} from "react";
import type {TodoColor} from "../../todoColors";

type NoFocusInputProps = {
    /* Opcionális: csak ott van rá szükség, ahol egy <label> vagy egy húzható elem
       hivatkozik a mezőre (a listaelemek a saját azonosítójukat adják ide). */
    id?: string;
    value: string;
    onChange: ChangeEventHandler<HTMLInputElement>;
    placeholder: string;
    /* A böngésző kiegészítése. Ahol a mező szabad szöveget vár (cím, kategória),
       ott "off"-ot kap, hogy a korábbi értékek ne takarják el a kártyát; ahol
       nincs megadva, ott a böngésző alapértelmezése marad érvényben. */
    autoComplete?: string;
    autoFocus: boolean;
    required: boolean;
    color: TodoColor;
    class: string;
};

export default function NoFocusInput(props: NoFocusInputProps) {
    return (
        <input id={props.id} value={props.value} onChange={props.onChange} placeholder={props.placeholder}
               autoComplete={props.autoComplete} autoFocus={props.autoFocus} required={props.required}
               className={props.class + " form-control no-focus bg-transparent text-" + props.color}/>
    );
}
